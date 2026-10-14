"""Isolated generation of smoothed operational pushback phases.

The output is not wired into the API. Geotechnical precedence re-validation
is intentionally outside this feature and must happen before operational use.
"""

import math
from typing import Any

import networkx as nx
import numpy as np
import pandas as pd

from core.compact_graph import CompactGraph
from models.schemas import FinancialParameters


def _window_neighbor_counts(mask: np.ndarray, radius: int) -> np.ndarray:
    """Count true cells in each 2D square window, excluding its center."""
    integral = np.pad(mask.astype(np.int32), ((1, 0), (1, 0)))
    integral = integral.cumsum(axis=0).cumsum(axis=1)

    row = np.arange(mask.shape[0])
    col = np.arange(mask.shape[1])
    row_start = np.maximum(row - radius, 0)
    row_end = np.minimum(row + radius, mask.shape[0] - 1)
    col_start = np.maximum(col - radius, 0)
    col_end = np.minimum(col + radius, mask.shape[1] - 1)

    window_counts = (
        integral[row_end[:, None] + 1, col_end[None, :] + 1]
        - integral[row_start[:, None], col_end[None, :] + 1]
        - integral[row_end[:, None] + 1, col_start[None, :]]
        + integral[row_start[:, None], col_start[None, :]]
    )
    return window_counts - mask.astype(np.int32)


def _validate_row_position(node_id: Any, row_count: int) -> int:
    if (
        isinstance(node_id, (bool, np.bool_))
        or not isinstance(node_id, (int, np.integer))
        or node_id < 0
        or node_id >= row_count
    ):
        raise ValueError(
            f"Graph node IDs must be integer row positions in [0, {row_count}); "
            f"got {node_id!r}."
        )
    return int(node_id)


def _validate_phase_graph_nodes(graph: Any, row_count: int) -> None:
    if isinstance(graph, CompactGraph):
        for node_id in graph.nodes:
            _validate_row_position(node_id, row_count)
        if graph.u.size and (
            np.any(graph.u < 0)
            or np.any(graph.u >= row_count)
            or np.any(graph.v < 0)
            or np.any(graph.v >= row_count)
        ):
            invalid_id = graph.u[(graph.u < 0) | (graph.u >= row_count)]
            if invalid_id.size == 0:
                invalid_id = graph.v[(graph.v < 0) | (graph.v >= row_count)]
            _validate_row_position(int(invalid_id[0]), row_count)
        return

    if isinstance(graph, nx.DiGraph) and not graph.is_multigraph():
        for node_id in graph.nodes:
            _validate_row_position(node_id, row_count)
        return

    raise TypeError("graph must be a CompactGraph or NetworkX DiGraph.")


def find_phase_precedence_violations(
    df: pd.DataFrame,
    graph: CompactGraph | nx.DiGraph,
    phase_col: str = "Pushback_Phase",
    max_examples: int = 50,
) -> dict[str, Any]:
    """Return phase-order violations for graph edges ``u -> v``.

    ``edges_checked`` counts edges whose source is mined (phase > 0). Edges
    from unmined sources are ignored. Example node IDs are DataFrame row
    positions, not index labels.
    """
    if phase_col not in df.columns:
        raise ValueError(f"Missing phase column: {phase_col!r}.")
    if isinstance(max_examples, bool) or not isinstance(max_examples, int) or max_examples < 0:
        raise ValueError("max_examples must be a non-negative integer.")

    row_count = len(df)
    _validate_phase_graph_nodes(graph, row_count)

    phases = pd.to_numeric(df[phase_col], errors="coerce").to_numpy(dtype=float)
    if not np.isfinite(phases).all():
        raise ValueError(f"Phase column {phase_col!r} must contain finite numeric values.")
    if (phases < 0).any() or not np.equal(phases, np.floor(phases)).all():
        raise ValueError(f"Phase column {phase_col!r} must contain non-negative integer IDs.")

    if isinstance(graph, CompactGraph):
        u = graph.u
        v = graph.v
        active = phases[u] > 0
        active_u = u[active]
        active_v = v[active]
        phase_u = phases[active_u]
        phase_v = phases[active_v]
        not_mined = phase_v == 0
        later_phase = phase_v > phase_u
        violation_mask = not_mined | later_phase
        violation_indices = np.flatnonzero(violation_mask)

        def make_violation(position: int) -> tuple[int, int, int, int, str]:
            u_id = int(active_u[position])
            v_id = int(active_v[position])
            kind = "predecessor_belum_ditambang" if not_mined[position] else "predecessor_fase_lebih_akhir"
            return u_id, v_id, int(phase_u[position]), int(phase_v[position]), kind

        examples = [
            make_violation(int(position))
            for position in violation_indices[:max_examples]
        ]
        return {
            "violation_count": int(violation_indices.size),
            "edges_checked": int(active_u.size),
            "violations": examples,
        }

    violation_count = 0
    edges_checked = 0
    examples = []
    for source, predecessor in graph.edges:
        source = _validate_row_position(source, row_count)
        predecessor = _validate_row_position(predecessor, row_count)
        source_phase = int(phases[source])
        if source_phase == 0:
            continue

        edges_checked += 1
        predecessor_phase = int(phases[predecessor])
        if predecessor_phase == 0:
            kind = "predecessor_belum_ditambang"
        elif predecessor_phase > source_phase:
            kind = "predecessor_fase_lebih_akhir"
        else:
            continue

        violation_count += 1
        if len(examples) < max_examples:
            examples.append((source, predecessor, source_phase, predecessor_phase, kind))

    return {
        "violation_count": violation_count,
        "edges_checked": edges_checked,
        "violations": examples,
    }


def assert_phase_precedence(
    df: pd.DataFrame,
    graph: CompactGraph | nx.DiGraph,
    phase_col: str = "Pushback_Phase",
    max_examples: int = 50,
) -> dict[str, Any]:
    """Return the report or raise ``ValueError`` when violations exist."""
    report = find_phase_precedence_violations(df, graph, phase_col, max_examples)
    if report["violation_count"]:
        raise ValueError(
            f"{report['violation_count']} precedence violations across "
            f"{report['edges_checked']} checked edges; "
            f"examples: {report['violations']}"
        )
    return report


def _aggregate_small_shells(
    first_rf: np.ndarray,
    tonnage: np.ndarray,
    min_pushback_tonnage: float | None,
) -> tuple[np.ndarray, dict]:
    if min_pushback_tonnage is not None and (
        not math.isfinite(min_pushback_tonnage) or min_pushback_tonnage < 0
    ):
        raise ValueError("min_pushback_tonnage must be finite and non-negative.")

    shell_values = np.sort(np.unique(first_rf[first_rf > 0]))
    phase_ids = np.zeros(len(first_rf), dtype=np.int32)
    shell_to_bucket = {}
    buckets = []

    if min_pushback_tonnage is None or min_pushback_tonnage == 0:
        buckets = [(float(shell_value),) for shell_value in shell_values]
        terminal_bucket_tonnage = None
    else:
        pending_shells = []
        pending_tonnage = 0.0
        for shell_value in shell_values:
            shell_tonnage = float(tonnage[first_rf == shell_value].sum())
            pending_shells.append(float(shell_value))
            pending_tonnage += shell_tonnage
            if not math.isfinite(pending_tonnage):
                raise ValueError("Aggregated shell tonnage must remain finite.")
            if pending_tonnage >= min_pushback_tonnage:
                buckets.append(tuple(pending_shells))
                pending_shells = []
                pending_tonnage = 0.0

        terminal_bucket_tonnage = pending_tonnage if pending_shells else None
        if pending_shells:
            buckets.append(tuple(pending_shells))

    for bucket_id, bucket_shells in enumerate(buckets, start=1):
        for shell_value in bucket_shells:
            shell_to_bucket[shell_value] = bucket_id
            phase_ids[first_rf == shell_value] = bucket_id

    terminal_bucket_below_minimum = bool(
        min_pushback_tonnage not in (None, 0)
        and terminal_bucket_tonnage is not None
        and terminal_bucket_tonnage < min_pushback_tonnage
    )
    aggregation_meta = {
        "minimum_tonnage": min_pushback_tonnage,
        "shell_to_bucket": shell_to_bucket,
        "terminal_bucket_tonnage": terminal_bucket_tonnage,
        "terminal_bucket_below_minimum": terminal_bucket_below_minimum,
    }
    return phase_ids, aggregation_meta


def _smooth_slice_boundaries(
    df: pd.DataFrame,
    phase_ids: np.ndarray,
    min_mining_width: float | None,
) -> np.ndarray:
    if min_mining_width is None or min_mining_width == 0:
        return phase_ids
    if min_mining_width < 0:
        raise ValueError("min_mining_width must be non-negative.")

    dx = pd.to_numeric(df["DX"], errors="coerce").to_numpy(dtype=float)
    if not np.isfinite(dx).all() or (dx <= 0).any():
        raise ValueError("DX must contain finite positive block widths for MMW smoothing.")
    block_width = float(np.median(dx))
    if "DY" in df.columns:
        dy = pd.to_numeric(df["DY"], errors="coerce").to_numpy(dtype=float)
        if not np.isfinite(dy).all() or (dy <= 0).any():
            raise ValueError("DY must contain finite positive block widths for MMW smoothing.")
        block_width = min(block_width, float(np.median(dy)))

    radius_blok = max(1, int(math.ceil(min_mining_width / block_width)))
    max_phase = int(phase_ids.max()) if len(phase_ids) else 0
    if max_phase <= 1:
        return phase_ids

    x = pd.to_numeric(df["X"], errors="coerce").to_numpy(dtype=float)
    y = pd.to_numeric(df["Y"], errors="coerce").to_numpy(dtype=float)
    z = pd.to_numeric(df["Z"], errors="coerce").to_numpy(dtype=float)
    if not (np.isfinite(x).all() and np.isfinite(y).all() and np.isfinite(z).all()):
        raise ValueError("X, Y, and Z must be finite for MMW smoothing.")

    reassignment = np.zeros(len(df), dtype=np.int32)
    for _, row_positions in df.groupby("Z", sort=False).indices.items():
        row_positions = np.asarray(row_positions, dtype=np.intp)
        level_x = x[row_positions]
        level_y = y[row_positions]
        cell_x = np.rint((level_x - level_x.min()) / block_width).astype(np.int64)
        cell_y = np.rint((level_y - level_y.min()) / block_width).astype(np.int64)

        width_x = int(cell_x.max()) + 1
        width_y = int(cell_y.max()) + 1
        linear_cells = cell_x * width_y + cell_y
        if len(np.unique(linear_cells)) != len(linear_cells):
            raise ValueError("Multiple blocks occupy the same XY cell at one Z level.")

        row_grid = np.full((width_x, width_y), -1, dtype=np.int32)
        row_grid[cell_x, cell_y] = row_positions
        occupied = row_grid >= 0
        level_phases = np.zeros((width_x, width_y), dtype=np.int32)
        level_phases[occupied] = phase_ids[row_grid[occupied]]

        for phase_id in range(1, max_phase):
            phase_mask = level_phases == phase_id
            if not phase_mask.any():
                continue

            same_phase_neighbors = _window_neighbor_counts(phase_mask, radius_blok)
            available_neighbors = _window_neighbor_counts(occupied, radius_blok)
            required_neighbors = np.minimum(
                2 * radius_blok + 1,
                np.maximum(available_neighbors, 1),
            )
            pinched = phase_mask & (same_phase_neighbors < required_neighbors)
            moved_rows = row_grid[pinched]
            reassignment[moved_rows] = phase_id + 1

    moved = reassignment > 0
    phase_ids[moved] = reassignment[moved]
    return phase_ids


def generate_operational_pushbacks(
    df: pd.DataFrame,
    params: FinancialParameters,
) -> pd.DataFrame:
    """Aggregate strategic shells and smooth thin boundaries by 2D Z slice.

    ``First_RF`` identifies the original strategic shell; zero means unmined.
    Spatial support uses a square XY neighborhood with radius
    ``ceil(min_mining_width / median_block_width)``. A shell cell needs at
    least ``2 * radius_blok + 1`` same-phase neighbors, capped by the number
    of model cells available in that local window. Pinched cells move to the
    next phase. The final phase is retained because it has no successor.

    This function deliberately does not perform Step 3 geotechnical
    precedence re-validation and must not yet be wired into the API.
    """
    required_columns = {"X", "Y", "Z", "DX", "Tonase", "First_RF"}
    missing_columns = sorted(required_columns.difference(df.columns))
    if missing_columns:
        raise ValueError(f"Missing required pushback columns: {missing_columns}")

    result = df.copy()
    first_rf = pd.to_numeric(result["First_RF"], errors="coerce").to_numpy(dtype=float)
    tonnage = pd.to_numeric(result["Tonase"], errors="coerce").to_numpy(dtype=float)
    if not np.isfinite(first_rf).all() or (first_rf < 0).any():
        raise ValueError("First_RF must contain finite non-negative values.")
    if not np.isfinite(tonnage).all() or (tonnage < 0).any():
        raise ValueError("Tonase must contain finite non-negative values.")

    phase_ids, aggregation_meta = _aggregate_small_shells(
        first_rf,
        tonnage,
        params.min_pushback_tonnage,
    )
    result.attrs["pushback_aggregation"] = aggregation_meta

    if result.empty:
        result["Pushback_Phase"] = phase_ids
        return result

    phase_ids = _smooth_slice_boundaries(
        result,
        phase_ids,
        params.min_mining_width,
    )

    if params.min_pushback_tonnage not in (None, 0) and len(phase_ids):
        terminal_phase = int(phase_ids.max())
        terminal_tonnage = float(tonnage[phase_ids == terminal_phase].sum())
        if not math.isfinite(terminal_tonnage):
            raise ValueError("Terminal bucket tonnage must remain finite.")
        aggregation_meta["terminal_bucket_tonnage"] = terminal_tonnage
        aggregation_meta["terminal_bucket_below_minimum"] = (
            terminal_tonnage < params.min_pushback_tonnage
        )
        result.attrs["pushback_aggregation"] = aggregation_meta

    remaining_phases = np.sort(np.unique(phase_ids[phase_ids > 0]))
    phase_remap = {phase_id: position for position, phase_id in enumerate(remaining_phases, start=1)}
    result["Pushback_Phase"] = np.array(
        [phase_remap.get(int(phase_id), 0) for phase_id in phase_ids],
        dtype=np.int32,
    )
    return result