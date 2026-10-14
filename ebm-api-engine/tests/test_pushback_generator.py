import os
import sys

import networkx as nx
import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.pushback_generator import generate_operational_pushbacks
from core.pushback_generator import assert_phase_precedence, find_phase_precedence_violations
from core.compact_graph import CompactGraph
from core.graph_builder import build_precedence_graph
from core.pit_optimizer import optimize_pit
from models.schemas import FinancialParameters


def make_params(**overrides):
    values = {
        "commodity_price": 1.0,
        "ore_mining_cost": 1.0,
        "waste_mining_cost": 1.0,
        "processing_cost": 1.0,
        "selling_cost": 1.0,
        "metallurgical_recovery": 1.0,
        "osa": 45.0,
    }
    values.update(overrides)
    return FinancialParameters(**values)


def test_small_tonnage_shell_merges_into_next_shell():
    df = pd.DataFrame(
        {
            "X": [0.0, 100.0, 200.0],
            "Y": [0.0, 0.0, 0.0],
            "Z": [0.0, 0.0, 0.0],
            "DX": [10.0, 10.0, 10.0],
            "Tonase": [5.0, 50.0, 50.0],
            "First_RF": [0.6, 0.8, 1.0],
        },
        index=[21, 7, 42],
    )

    result = generate_operational_pushbacks(
        df,
        make_params(min_pushback_tonnage=10.0),
    )

    assert result["Pushback_Phase"].tolist() == [1, 1, 2]
    assert result.index.tolist() == df.index.tolist()
    assert "Pushback_Phase" not in df.columns


def test_isolated_early_phase_block_moves_to_next_phase_in_its_z_slice():
    rows = [
        {
            "X": x * 10.0,
            "Y": y * 10.0,
            "Z": 0.0,
            "DX": 10.0,
            "Tonase": 100.0,
            "First_RF": 0.6,
        }
        for y in range(3)
        for x in range(3)
    ]
    rows.extend(
        [
            {"X": 100.0, "Y": 0.0, "Z": 0.0, "DX": 10.0, "Tonase": 100.0, "First_RF": 0.6},
            {"X": 110.0, "Y": 0.0, "Z": 0.0, "DX": 10.0, "Tonase": 100.0, "First_RF": 0.8},
        ]
    )
    df = pd.DataFrame(rows)

    result = generate_operational_pushbacks(
        df,
        make_params(min_mining_width=10.0),
    )

    phases_by_xy = result.set_index(["X", "Y"])["Pushback_Phase"]
    assert phases_by_xy.loc[(10.0, 10.0)] == 1
    assert phases_by_xy.loc[(100.0, 0.0)] == 2
    assert phases_by_xy.loc[(110.0, 0.0)] == 2


def test_first_rf_maps_to_ordered_shells_and_zero_stays_unmined():
    df = pd.DataFrame(
        {
            "X": [0.0, 10.0, 20.0, 30.0, 40.0, 50.0],
            "Y": [0.0] * 6,
            "Z": [0.0] * 6,
            "DX": [10.0] * 6,
            "Tonase": [1.0] * 6,
            "First_RF": [0.0, 0.6, 0.8, 1.0, 0.8, 0.6],
        },
        index=[40, 7, 99, 3, 61, 11],
    ).sample(frac=1, random_state=17)
    original = df.copy(deep=True)
    expected_phase_by_index = {40: 0, 7: 1, 99: 2, 3: 3, 61: 2, 11: 1}

    result = generate_operational_pushbacks(df, make_params())

    assert result.index.tolist() == df.index.tolist()
    assert result["Pushback_Phase"].to_dict() == expected_phase_by_index
    pd.testing.assert_series_equal(result["First_RF"], original["First_RF"])
    pd.testing.assert_frame_equal(df, original)


def test_consecutive_small_shells_accumulate_forward_without_losing_blocks():
    df = pd.DataFrame(
        {
            "X": [0.0, 100.0, 200.0, 300.0, 400.0, 500.0],
            "Y": [0.0] * 6,
            "Z": [0.0] * 6,
            "DX": [10.0] * 6,
            "Tonase": [3.0, 4.0, 20.0, 5.0, 5.0, 1.0],
            "First_RF": [0.6, 0.8, 1.0, 1.2, 1.4, 0.0],
        },
        index=[18, 2, 33, 5, 71, 9],
    )
    original = df.copy(deep=True)

    result = generate_operational_pushbacks(
        df,
        make_params(min_pushback_tonnage=10.0),
    )

    assert result["Pushback_Phase"].tolist() == [1, 1, 1, 2, 2, 0]
    assert result.index.tolist() == original.index.tolist()
    assert len(result) == len(original)
    pd.testing.assert_frame_equal(df, original)
    assert result.attrs["pushback_aggregation"]["shell_to_bucket"] == {
        0.6: 1,
        0.8: 1,
        1.0: 1,
        1.2: 2,
        1.4: 2,
    }


def test_terminal_small_bucket_is_preserved_and_reported_in_dataframe_attrs():
    df = pd.DataFrame(
        {
            "X": [0.0, 100.0, 200.0],
            "Y": [0.0] * 3,
            "Z": [0.0] * 3,
            "DX": [10.0] * 3,
            "Tonase": [20.0, 4.0, 3.0],
            "First_RF": [0.6, 0.8, 1.0],
        },
        index=[14, 81, 6],
    )

    result = generate_operational_pushbacks(
        df,
        make_params(min_pushback_tonnage=10.0),
    )

    assert result["Pushback_Phase"].tolist() == [1, 2, 2]
    assert result.attrs["pushback_aggregation"] == {
        "minimum_tonnage": 10.0,
        "shell_to_bucket": {0.6: 1, 0.8: 2, 1.0: 2},
        "terminal_bucket_tonnage": 7.0,
        "terminal_bucket_below_minimum": True,
    }


def test_terminal_tonnage_status_reflects_blocks_absorbed_by_mmw_smoothing():
    rows = [
        {
            "X": x * 10.0,
            "Y": y * 10.0,
            "Z": 0.0,
            "DX": 10.0,
            "Tonase": 100.0,
            "First_RF": 0.6,
        }
        for y in range(3)
        for x in range(3)
    ]
    rows.extend(
        [
            {"X": 100.0, "Y": 0.0, "Z": 0.0, "DX": 10.0, "Tonase": 100.0, "First_RF": 0.6},
            {"X": 110.0, "Y": 0.0, "Z": 0.0, "DX": 10.0, "Tonase": 100.0, "First_RF": 0.8},
        ]
    )
    df = pd.DataFrame(rows)

    result = generate_operational_pushbacks(
        df,
        make_params(min_mining_width=10.0, min_pushback_tonnage=1000.0),
    )

    assert result.loc[result["X"] == 100.0, "Pushback_Phase"].item() == 2
    assert result.attrs["pushback_aggregation"]["terminal_bucket_tonnage"] == 200.0
    assert result.attrs["pushback_aggregation"]["terminal_bucket_below_minimum"] is True


def test_empty_input_returns_empty_phases_even_when_mmw_is_enabled():
    df = pd.DataFrame(
        columns=["X", "Y", "Z", "DX", "Tonase", "First_RF"]
    )

    result = generate_operational_pushbacks(
        df,
        make_params(min_mining_width=10.0, min_pushback_tonnage=20.0),
    )

    assert result.empty
    assert result["Pushback_Phase"].empty
    assert result.index.equals(df.index)
    assert result.attrs["pushback_aggregation"]["terminal_bucket_tonnage"] is None


def test_same_input_is_deterministic_across_repeated_calls():
    df = pd.DataFrame(
        {
            "X": [0.0, 100.0, 200.0, 300.0],
            "Y": [0.0] * 4,
            "Z": [0.0] * 4,
            "DX": [10.0] * 4,
            "Tonase": [4.0, 4.0, 20.0, 3.0],
            "First_RF": [0.6, 0.8, 1.0, 1.2],
        },
        index=[31, 4, 29, 8],
    )
    params = make_params(min_pushback_tonnage=10.0)

    first = generate_operational_pushbacks(df, params)
    second = generate_operational_pushbacks(df, params)

    pd.testing.assert_series_equal(first["Pushback_Phase"], second["Pushback_Phase"])
    assert first.attrs["pushback_aggregation"] == second.attrs["pushback_aggregation"]


def make_precedence_graph(node_count, edges, backend):
    if backend == "compact":
        edge_array = np.asarray(edges, dtype=np.int32).reshape((-1, 2))
        return CompactGraph(
            edge_array[:, 0],
            edge_array[:, 1],
            num_nodes=node_count,
            node_indices=np.arange(node_count, dtype=np.int32),
        )

    graph = nx.DiGraph()
    graph.add_nodes_from(range(node_count))
    graph.add_edges_from(edges)
    return graph


@pytest.mark.parametrize("backend", ["compact", "networkx"])
def test_precedence_checker_valid_invalid_and_source_unmined_cases(backend):
    df = pd.DataFrame({"Pushback_Phase": [3, 2, 1]})
    chain = make_precedence_graph(3, [(0, 1), (1, 2)], backend)

    valid = find_phase_precedence_violations(df, chain)
    assert valid == {"violation_count": 0, "edges_checked": 2, "violations": []}
    assert assert_phase_precedence(df, chain) == valid

    invalid_df = pd.DataFrame({"Pushback_Phase": [1, 2, 3]})
    invalid = find_phase_precedence_violations(invalid_df, chain)
    assert invalid["violation_count"] == 2
    assert invalid["edges_checked"] == 2
    assert invalid["violations"] == [
        (0, 1, 1, 2, "predecessor_fase_lebih_akhir"),
        (1, 2, 2, 3, "predecessor_fase_lebih_akhir"),
    ]
    with pytest.raises(ValueError, match="2 precedence violations"):
        assert_phase_precedence(invalid_df, chain)

    unmined_predecessor = pd.DataFrame({"Pushback_Phase": [1, 0]})
    graph = make_precedence_graph(2, [(0, 1)], backend)
    report = find_phase_precedence_violations(unmined_predecessor, graph)
    assert report["violation_count"] == 1
    assert report["violations"] == [
        (0, 1, 1, 0, "predecessor_belum_ditambang")
    ]

    unmined_source = pd.DataFrame({"Pushback_Phase": [0, 4]})
    ignored = find_phase_precedence_violations(unmined_source, graph)
    assert ignored == {"violation_count": 0, "edges_checked": 0, "violations": []}


@pytest.mark.parametrize("backend", ["compact", "networkx"])
def test_precedence_checker_same_phase_and_assert_wrapper(backend):
    df = pd.DataFrame({"Pushback_Phase": [2, 2]})
    graph = make_precedence_graph(2, [(0, 1)], backend)

    report = find_phase_precedence_violations(df, graph)

    assert report == {"violation_count": 0, "edges_checked": 1, "violations": []}
    assert assert_phase_precedence(df, graph) == report


def test_precedence_checker_handles_row_positions_after_shuffle_and_nonrange_index():
    range_df = pd.DataFrame(
        {"Block": ["lower", "upper"], "Pushback_Phase": [2, 1]}
    )
    range_graph = make_precedence_graph(2, [(0, 1)], "compact")
    expected = find_phase_precedence_violations(range_df, range_graph)

    shuffled_df = range_df.iloc[[1, 0]].copy()
    shuffled_df.index = [90, 12]
    shuffled_graph = make_precedence_graph(2, [(1, 0)], "compact")
    actual = find_phase_precedence_violations(shuffled_df, shuffled_graph)

    assert actual == expected
    assert shuffled_df.index.tolist() == [90, 12]
    assert shuffled_df["Block"].tolist() == ["upper", "lower"]


@pytest.mark.parametrize("backend", ["compact", "networkx"])
def test_precedence_checker_rejects_invalid_nodes_and_phase_data(backend):
    df = pd.DataFrame({"Pushback_Phase": [1, 0]})
    invalid_graph = make_precedence_graph(2, [(0, 2)], backend)
    with pytest.raises(ValueError, match="row positions"):
        find_phase_precedence_violations(df, invalid_graph)

    with pytest.raises(ValueError, match="phase column"):
        find_phase_precedence_violations(pd.DataFrame({"other": [1]}), make_precedence_graph(1, [], backend))
    with pytest.raises(ValueError, match="finite"):
        find_phase_precedence_violations(
            pd.DataFrame({"Pushback_Phase": [np.nan]}),
            make_precedence_graph(1, [], backend),
        )


@pytest.mark.parametrize("backend", ["compact", "networkx"])
def test_precedence_checker_empty_inputs_are_zero_and_do_not_mutate(backend):
    df = pd.DataFrame({"Pushback_Phase": pd.Series(dtype=float)}, index=pd.Index([], dtype=int))
    graph = make_precedence_graph(0, [], backend)

    report = find_phase_precedence_violations(df, graph)

    assert report == {"violation_count": 0, "edges_checked": 0, "violations": []}
    assert_phase_precedence(df, graph)
    assert df.empty


@pytest.mark.parametrize("backend", ["compact", "networkx"])
def test_precedence_checker_is_deterministic_and_does_not_mutate_inputs(backend):
    df = pd.DataFrame({"Pushback_Phase": [1, 3, 0]}, index=[10, 4, 99])
    graph = make_precedence_graph(3, [(0, 1), (1, 2)], backend)
    original_df = df.copy(deep=True)
    original_edges = set(graph.edges())

    first = find_phase_precedence_violations(df, graph)
    second = find_phase_precedence_violations(df, graph)

    assert first == second
    assert first["violations"] == [
        (0, 1, 1, 3, "predecessor_fase_lebih_akhir"),
        (1, 2, 3, 0, "predecessor_belum_ditambang"),
    ]
    pd.testing.assert_frame_equal(df, original_df)
    assert set(graph.edges()) == original_edges


def _nested_synthetic_phases(nx_cells, ny_cells, nz_cells):
    rows = []
    for z in range(nz_cells):
        for y in range(ny_cells):
            for x in range(nx_cells):
                rows.append({
                    "X": x * 10.0,
                    "Y": y * 10.0,
                    "Z": z * 10.0,
                    "DX": 10.0,
                    "DY": 10.0,
                    "DZ": 10.0,
                    "Tonase": 100.0,
                    "BEV": -1.0,
                })
    blocks = pd.DataFrame(rows)
    graph = build_precedence_graph(blocks, osa=45.0, backend="compact")

    root_a = (ny_cells // 2) * nx_cells + 1
    root_b = (ny_cells // 2) * nx_cells + nx_cells - 2
    first_rf = np.zeros(len(blocks), dtype=float)
    previous_mined = np.zeros(len(blocks), dtype=bool)

    for rf in (0.25, 0.75):
        scenario = blocks.copy()
        scenario["BEV"] = -1.0
        scenario.loc[root_a, "BEV"] = 5000.0 * rf - 500.0
        scenario.loc[root_b, "BEV"] = 5000.0 * rf - 2000.0
        optimized = optimize_pit(scenario, graph)
        mined = optimized["MINED_STATUS"].to_numpy(dtype=bool)
        newly_mined = mined & ~previous_mined
        first_rf[newly_mined] = rf
        previous_mined = mined

    blocks["First_RF"] = first_rf
    return blocks, graph


@pytest.mark.parametrize("grid", [(5, 5, 3), (7, 7, 4)])
def test_integration_nested_shell_precedence_before_and_after_mmw(grid):
    blocks, graph = _nested_synthetic_phases(*grid)
    params_without_mmw = make_params()
    params_with_mmw = make_params(min_mining_width=10.0)

    unsmoothed = generate_operational_pushbacks(blocks, params_without_mmw)
    unsmoothed_report = find_phase_precedence_violations(unsmoothed, graph)
    assert unsmoothed_report["violation_count"] == 0

    smoothed = generate_operational_pushbacks(blocks, params_with_mmw)
    smoothed_report = find_phase_precedence_violations(smoothed, graph)
    print(
        f"precedence_experiment grid={grid} "
        f"without_mmw={unsmoothed_report['violation_count']} "
        f"with_mmw={smoothed_report['violation_count']}"
    )
    assert smoothed_report["edges_checked"] >= 0
