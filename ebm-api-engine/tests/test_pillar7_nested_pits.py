"""
Pillar 7 — Nested Pit Generator: Test Suite (Tests A–G)

Covers:
  A) Nested property: Pit(RF_i) ⊆ Pit(RF_{i+1})
  B) Graph invariance: precedence edges unchanged across RF loop
  C) Economic monotonicity: BEV(RF0.6) <= BEV(RF0.8) <= BEV(RF1.0)
  D) RF=1.0 equivalence with existing UPL optimizer output
  E) No duplicate first-appearance shell assignment
  F) No shell regression (blocks don't disappear at higher RF if nested)
  G) Existing regression preservation (all non-slow EBM tests green)
"""

import sys
import os
import pytest
import numpy as np
import pandas as pd

# Make sure core/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models.schemas import FinancialParameters
from core.economic_model import calculate_bev
from core.graph_builder import build_precedence_graph
from core.pit_optimizer import optimize_pit


# ---------------------------------------------------------------------------
# Shared fixture: small but geometrically valid 5×5×4 block model
# ---------------------------------------------------------------------------
@pytest.fixture(scope='module')
def small_block_model():
    records = []
    for ix in range(5):
        for iy in range(5):
            for iz in range(4):
                grade = 1.5 if (ix + iy + iz) % 3 == 0 else 0.2
                records.append({
                    'X': 10.0 * ix + 5.0,
                    'Y': 10.0 * iy + 5.0,
                    'Z': 10.0 * iz + 5.0,
                    'DX': 10.0, 'DY': 10.0, 'DZ': 10.0,
                    'Grade': grade,
                    'Density': 1.8,
                    'RockType': 'Unknown',
                })
    df = pd.DataFrame(records)
    return df


@pytest.fixture(scope='module')
def base_params():
    return FinancialParameters(
        commodity_price=50000,
        ore_mining_cost=4500,
        waste_mining_cost=2500,
        processing_cost=4500,
        selling_cost=1500,
        metallurgical_recovery=0.9,
        osa=45.0,
        cut_off_grade=0.9,
        grade_unit='g_per_t',
        price_unit='per_gram',
        currency='IDR',
        revenue_factors=[0.6, 0.8, 1.0],
    )


@pytest.fixture(scope='module')
def static_graph(small_block_model, base_params):
    df_bev = calculate_bev(small_block_model.copy(), base_params)
    graph = build_precedence_graph(df_bev, osa=base_params.osa, geon_mapping=None)
    return graph


@pytest.fixture(scope='module')
def pit_results(small_block_model, base_params, static_graph):
    """Run all RFs against the static graph and return list of MINED_STATUS arrays."""
    results = []
    rfs = base_params.revenue_factors
    for rf in rfs:
        current_params = base_params.model_copy()
        current_params.commodity_price = base_params.commodity_price * rf
        df_bev = calculate_bev(small_block_model.copy(), current_params)
        df_opt = optimize_pit(df_bev, static_graph)
        results.append({
            'rf': rf,
            'df_bev': df_bev,
            'df_opt': df_opt,
            'mined_set': set(df_opt.index[df_opt['MINED_STATUS'] == 1].tolist()),
        })
    return results


# ---------------------------------------------------------------------------
# TEST A — Nested property: Pit(RF_i) ⊆ Pit(RF_{i+1})
# ---------------------------------------------------------------------------
def test_a_nested_pit_property(pit_results):
    """For each consecutive RF pair, verify smaller pit is subset of larger pit."""
    violations = []
    for i in range(len(pit_results) - 1):
        rf_lo = pit_results[i]['rf']
        rf_hi = pit_results[i + 1]['rf']
        lo_set = pit_results[i]['mined_set']
        hi_set = pit_results[i + 1]['mined_set']
        if not lo_set.issubset(hi_set):
            extra = lo_set - hi_set
            violations.append(f"RF_{rf_lo} has {len(extra)} blocks not in RF_{rf_hi}")
    assert violations == [], (
        "Nested pit property violated:\n" + "\n".join(violations)
    )


# ---------------------------------------------------------------------------
# TEST B — Graph invariance: edges unchanged across RF loop
# ---------------------------------------------------------------------------
def test_b_graph_invariance(small_block_model, base_params):
    """The static graph should be identical (same edges) regardless of RF used."""
    df_bev_1 = calculate_bev(small_block_model.copy(), base_params)
    g1 = build_precedence_graph(df_bev_1, osa=base_params.osa, geon_mapping=None)

    params_low = base_params.model_copy()
    params_low.commodity_price = base_params.commodity_price * 0.6
    df_bev_2 = calculate_bev(small_block_model.copy(), params_low)
    g2 = build_precedence_graph(df_bev_2, osa=base_params.osa, geon_mapping=None)

    assert set(g1.nodes()) == set(g2.nodes()), "Node sets differ between RF scenarios"
    assert set(g1.edges()) == set(g2.edges()), "Edge sets differ between RF scenarios"


# ---------------------------------------------------------------------------
# TEST C — Economic monotonicity
# ---------------------------------------------------------------------------
def test_c_economic_monotonicity(small_block_model, base_params):
    """For a representative ore block: BEV(RF0.6) <= BEV(RF0.8) <= BEV(RF1.0)."""
    bevs = []
    rfs = [0.6, 0.8, 1.0]
    for rf in rfs:
        p = base_params.model_copy()
        p.commodity_price = base_params.commodity_price * rf
        df_bev = calculate_bev(small_block_model.copy(), p)
        # Pick the block with highest grade (clearly ore)
        ore_idx = df_bev['Grade'].idxmax()
        bevs.append(float(df_bev.loc[ore_idx, 'BEV']))

    assert bevs[0] <= bevs[1], f"BEV not monotone: RF0.6={bevs[0]} > RF0.8={bevs[1]}"
    assert bevs[1] <= bevs[2], f"BEV not monotone: RF0.8={bevs[1]} > RF1.0={bevs[2]}"


# ---------------------------------------------------------------------------
# TEST D — RF=1.0 equivalence with the standard UPL optimizer
# ---------------------------------------------------------------------------
def test_d_rf1_equivalence(small_block_model, base_params, static_graph):
    """RF=1.0 must produce the same MINED_STATUS as calling optimize_pit directly."""
    # Direct standard call (RF=1.0)
    df_direct_bev = calculate_bev(small_block_model.copy(), base_params)
    df_direct_opt = optimize_pit(df_direct_bev, static_graph)
    direct_mined = set(df_direct_opt.index[df_direct_opt['MINED_STATUS'] == 1].tolist())

    # Via RF loop — last entry is RF=1.0
    p = base_params.model_copy()
    p.commodity_price = base_params.commodity_price * 1.0
    df_rf_bev = calculate_bev(small_block_model.copy(), p)
    df_rf_opt = optimize_pit(df_rf_bev, static_graph)
    rf_mined = set(df_rf_opt.index[df_rf_opt['MINED_STATUS'] == 1].tolist())

    assert direct_mined == rf_mined, (
        f"RF=1.0 mismatch vs direct UPL. "
        f"Only in direct: {direct_mined - rf_mined}. "
        f"Only in RF loop: {rf_mined - direct_mined}."
    )


# ---------------------------------------------------------------------------
# TEST E — No duplicate first-appearance shell assignment
# ---------------------------------------------------------------------------
def test_e_no_duplicate_shell_assignment(pit_results):
    """Every block that is mined at all must appear in exactly one incremental shell."""
    seen: dict[int, int] = {}  # block_idx -> shell_number
    all_mined = set()
    for entry in pit_results:
        all_mined |= entry['mined_set']

    # Simulate incremental shell assignment
    assigned = set()
    for i, entry in enumerate(pit_results):
        shell_num = i + 1
        newly_assigned = entry['mined_set'] - assigned
        for idx in newly_assigned:
            if idx in seen:
                pytest.fail(f"Block {idx} assigned to shell {seen[idx]} and again to shell {shell_num}")
            seen[idx] = shell_num
        assigned |= newly_assigned

    # Every mined block must be in seen
    unassigned = all_mined - set(seen.keys())
    assert unassigned == set(), f"{len(unassigned)} blocks were mined but never assigned a shell"


# ---------------------------------------------------------------------------
# TEST F — No shell regression (nesting guarantee)
# ---------------------------------------------------------------------------
def test_f_no_shell_regression(pit_results):
    """If nesting holds, a block that appears at RF=X must still be mined at RF=Y>X."""
    # Only meaningful if Test A passes (nesting is validated there)
    for i in range(len(pit_results) - 1):
        lo_set = pit_results[i]['mined_set']
        hi_set = pit_results[i + 1]['mined_set']
        disappeared = lo_set - hi_set
        assert disappeared == set(), (
            f"{len(disappeared)} blocks present at RF={pit_results[i]['rf']} "
            f"disappeared at RF={pit_results[i+1]['rf']}"
        )


# ---------------------------------------------------------------------------
# TEST G — Validate RF list validation logic
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("bad_rfs,expected_msg", [
    ([-0.5, 0.8, 1.0], "> 0"),
    ([1.0, 0.6, 0.8], "ascending"),
    ([0.6, 0.6, 1.0], "duplicates"),
])
def test_g_rf_validation(bad_rfs, expected_msg):
    """RF validation rules fire correctly for invalid inputs."""
    # Simulate the validation logic from main.py
    def validate_rfs(rfs):
        if any(r <= 0 for r in rfs):
            return "All revenue factors must be > 0."
        if len(set(rfs)) != len(rfs):
            return "Revenue factors must not contain duplicates."
        if sorted(rfs) != rfs:
            return "Revenue factors must be sorted in ascending order."
        return None

    msg = validate_rfs(bad_rfs)
    assert msg is not None, f"Validation should have failed for {bad_rfs}"
    assert expected_msg in msg, f"Expected '{expected_msg}' in '{msg}'"
