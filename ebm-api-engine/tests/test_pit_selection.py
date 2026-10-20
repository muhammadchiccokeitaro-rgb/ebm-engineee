import io
import json
import math
import os
import sys

import networkx as nx
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.compact_graph import CompactGraph
from core.graph_builder import build_precedence_graph
from core.pit_optimizer import optimize_pit
from core.pushback_generator import find_phase_precedence_violations
from core.pit_selection import calculate_pit_selection
from main import app
from models.schemas import FinancialParameters


client = TestClient(app)


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


def four_block_case():
    blocks = pd.DataFrame(
        {
            "X": [0.0, 10.0, 20.0, 30.0],
            "Y": [0.0, 0.0, 0.0, 0.0],
            "Z": [0.0, 20.0, 10.0, -10.0],
            "Tonase": [6.0, 3.0, 6.0, 2.0],
            "First_RF": [0.5, 1.0, 1.0, 0.5],
        },
        index=[91, 4, 70, 12],
    )
    snapshots = {
        0.5: pd.DataFrame(
            {
                "BEV": [35.0, -10.0, 60.0, -5.0],
                "Destination": ["Ore", "Waste", "Ore", "Waste"],
                "Tonase": blocks["Tonase"].to_numpy(),
            },
            index=blocks.index,
        ),
        1.0: pd.DataFrame(
            {
                "BEV": [40.0, -10.0, 60.0, -5.0],
                "Destination": ["Ore", "Waste", "Ore", "Waste"],
                "Tonase": blocks["Tonase"].to_numpy(),
            },
            index=blocks.index,
        ),
    }
    return blocks, snapshots


def candidate_for(result, rf):
    return next(candidate for candidate in result["candidates"] if candidate["rf"] == rf)


def test_four_block_hand_calculation_best_worst_npv_and_recommendation():
    blocks, snapshots = four_block_case()

    result = calculate_pit_selection(
        blocks,
        snapshots,
        production_capacity_tpy=10.0,
        discount_rate=0.1,
    )
    candidate = candidate_for(result, 1.0)

    assert candidate["undiscounted_value"] == 85.0
    assert candidate["ore_tonnes"] == 12.0
    assert candidate["waste_tonnes"] == 5.0
    assert candidate["stripping_ratio"] == pytest.approx(5.0 / 12.0)
    assert candidate["mine_life_years"] == {"best": 2, "worst": 2}
    assert candidate["npv_best"] == pytest.approx(25.0 / 1.1 + 60.0 / 1.21)
    assert candidate["npv_worst"] == pytest.approx(50.0 / 1.1 + 35.0 / 1.21)
    assert result["recommendation"] == {
        "best_case_rf": 1.0,
        "worst_case_rf": 1.0,
        "recommendations_differ": False,
    }
    assert result["valuation_basis"] == "base_price (RF=1.0)"
    assert result["assumptions"]["valuation_basis"] == "base_price (RF=1.0)"


def test_small_rf_pit_uses_base_price_values_and_undiscounted_sum():
    blocks, snapshots = four_block_case()

    result = calculate_pit_selection(blocks, snapshots, 10.0, discount_rate=0.1)
    candidate = candidate_for(result, 0.5)
    expected_base_value = float(snapshots[1.0].iloc[[0, 3]]["BEV"].sum())

    assert candidate["undiscounted_value"] == expected_base_value == 35.0
    assert candidate["npv_best"] == pytest.approx(35.0 / 1.1)
    assert candidate["npv_worst"] == pytest.approx(35.0 / 1.1)


def test_largest_rf_pit_keeps_base_snapshot_undiscounted_sum():
    blocks, snapshots = four_block_case()
    pit_positions = np.flatnonzero((blocks["First_RF"] > 0) & (blocks["First_RF"] <= 1.0))
    expected_base_value = float(snapshots[1.0].iloc[pit_positions]["BEV"].sum())

    result = calculate_pit_selection(blocks, snapshots, 10.0, discount_rate=0.1)
    candidate = candidate_for(result, 1.0)

    assert candidate["undiscounted_value"] == expected_base_value == 85.0


def test_missing_rf_one_snapshot_is_rejected():
    blocks, snapshots = four_block_case()
    snapshots.pop(1.0)

    with pytest.raises(ValueError, match="RF=1.0 base-price snapshot"):
        calculate_pit_selection(blocks, snapshots, 10.0, discount_rate=0.1)


def test_zero_discount_rate_equals_undiscounted_value_for_each_order():
    blocks, snapshots = four_block_case()

    result = calculate_pit_selection(blocks, snapshots, 10.0, discount_rate=0.0)

    for candidate in result["candidates"]:
        assert candidate["npv_best"] == candidate["undiscounted_value"]
        assert candidate["npv_worst"] == candidate["undiscounted_value"]


def test_capacity_large_enough_puts_every_block_in_year_one():
    blocks, snapshots = four_block_case()

    result = calculate_pit_selection(blocks, snapshots, 1_000_000.0, discount_rate=0.1)
    candidate = candidate_for(result, 1.0)

    assert candidate["mine_life_years"] == {"best": 1, "worst": 1}
    assert candidate["npv_best"] == pytest.approx(85.0 / 1.1)
    assert candidate["npv_worst"] == pytest.approx(85.0 / 1.1)


def test_small_capacity_years_and_waste_before_first_ore_are_manual():
    blocks, snapshots = four_block_case()

    result = calculate_pit_selection(blocks, snapshots, 5.0, discount_rate=0.1)
    candidate = candidate_for(result, 1.0)

    # Best: ore(6) sets year 2; waste, waste remain year 2; final ore sets year 3.
    # Worst: waste before the first ore is year 1, then ore years 2 and 3.
    assert candidate["mine_life_years"] == {"best": 3, "worst": 3}
    assert candidate["npv_best"] == pytest.approx(25.0 / 1.1**2 + 60.0 / 1.1**3)
    assert candidate["npv_worst"] == pytest.approx(-10.0 / 1.1 + 60.0 / 1.1**2 + 35.0 / 1.1**3)


@pytest.mark.parametrize("backend", ["compact", "networkx"])
def test_best_case_rank_order_obeys_graph_precedence(backend):
    blocks = pd.DataFrame(
        {
            "X": [0.0, 0.0, 0.0],
            "Y": [0.0, 0.0, 0.0],
            "Z": [0.0, 10.0, 20.0],
            "DX": [10.0] * 3,
            "DY": [10.0] * 3,
            "DZ": [10.0] * 3,
            "BEV": [10.0] * 3,
            "Tonase": [1.0] * 3,
            "First_RF": [0.5] * 3,
        }
    )
    graph = build_precedence_graph(blocks, osa=45.0, backend=backend)
    best_order = sorted(
        range(len(blocks)),
        key=lambda position: (
            blocks.iloc[position]["First_RF"],
            -blocks.iloc[position]["Z"],
            position,
        ),
    )
    rank = np.empty(len(blocks), dtype=np.int64)
    rank[best_order] = np.arange(1, len(blocks) + 1)
    ranked_blocks = blocks.copy()
    ranked_blocks["Pushback_Phase"] = rank

    report = find_phase_precedence_violations(ranked_blocks, graph)

    assert report["violation_count"] == 0


def test_shuffled_nonrange_input_gives_same_result_and_preserves_identity():
    blocks, snapshots = four_block_case()
    params = make_params()
    expected = calculate_pit_selection(blocks, snapshots, 10.0, 0.1)

    shuffled = blocks.sample(frac=1.0, random_state=13)
    shuffled_snapshots = {
        rf: frame.loc[shuffled.index]
        for rf, frame in snapshots.items()
    }
    original_blocks = shuffled.copy(deep=True)
    original_snapshots = {rf: frame.copy(deep=True) for rf, frame in shuffled_snapshots.items()}
    actual = calculate_pit_selection(shuffled, shuffled_snapshots, 10.0, 0.1)

    assert actual == expected
    pd.testing.assert_frame_equal(shuffled, original_blocks)
    for rf in shuffled_snapshots:
        pd.testing.assert_frame_equal(shuffled_snapshots[rf], original_snapshots[rf])
    assert shuffled.index.tolist() == original_blocks.index.tolist()


@pytest.mark.parametrize(
    "production_capacity, discount_rate",
    [
        (0.0, 0.1),
        (-1.0, 0.1),
        (float("nan"), 0.1),
        (float("inf"), 0.1),
        (10.0, -0.1),
        (10.0, 1.1),
        (10.0, float("nan")),
        (10.0, float("inf")),
    ],
)
def test_invalid_capacity_or_discount_is_rejected(production_capacity, discount_rate):
    blocks, snapshots = four_block_case()

    with pytest.raises(ValueError):
        calculate_pit_selection(
            blocks,
            snapshots,
            production_capacity,
            discount_rate,
        )


def test_empty_input_returns_defined_empty_selection():
    empty = pd.DataFrame(columns=["Z", "First_RF", "Tonase"])

    result = calculate_pit_selection(empty, {}, 10.0, 0.0)

    assert result["candidates"] == []
    assert result["recommendation"] == {
        "best_case_rf": None,
        "worst_case_rf": None,
        "recommendations_differ": False,
    }
    assert "assumptions" in result


def test_nonfinite_or_negative_tonnage_is_rejected():
    blocks, snapshots = four_block_case()
    blocks.loc[blocks.index[0], "Tonase"] = -1.0

    with pytest.raises(ValueError, match="Tonase"):
        calculate_pit_selection(blocks, snapshots, 10.0, 0.0)


def test_api_without_production_capacity_keeps_baseline_response_contract():
    rows = []
    for z in range(2):
        for y in range(2):
            for x in range(2):
                rows.append({
                    "X": x * 10,
                    "Y": y * 10,
                    "Z": z * 10,
                    "DX": 10,
                    "DY": 10,
                    "DZ": 10,
                    "Grade": 1.5,
                    "Density": 2.5,
                    "RockType": "Ore",
                })
    df = pd.DataFrame(rows)
    params = {
        "commodity_price": 50000,
        "ore_mining_cost": 4500,
        "waste_mining_cost": 2500,
        "processing_cost": 4500,
        "selling_cost": 1500,
        "metallurgical_recovery": 0.9,
        "osa": 45,
        "cut_off_grade": 0.9,
        "grade_unit": "g_per_t",
        "price_unit": "per_gram",
    }

    response = client.post(
        "/api/v1/optimize-pit",
        files={"file": ("baseline.csv", io.BytesIO(df.to_csv(index=False).encode()), "text/csv")},
        data={"financial_params": json.dumps(params)},
    )

    assert response.status_code == 200
    data = response.json()
    assert set(data) == {
        "nested_pits",
        "incremental_shells",
        "pushbacks",
        "validation",
        "summary",
        "pit_shell_matrix",
        "optimizer_meta",
        "min_x",
        "min_y",
        "lithologies",
        "timings",
        "graph_info",
    }
    assert "pit_selection" not in data
    assert len(data["pit_shell_matrix"]) == 8
    assert sum(block["MINED_STATUS"] for block in data["pit_shell_matrix"]) == 8
    assert data["summary"]["total_ore_tonnage"] == 20000.0
    assert data["summary"]["total_waste_tonnage"] == 0.0
    assert data["summary"]["total_undiscounted_value"] == pytest.approx(1_140_000_000.0)

    params_with_selection = {
        **params,
        "revenue_factors": [0.6, 1.0],
        "production_capacity_tpy": 10_000.0,
        "discount_rate": 0.1,
        "mining_capacity_tpy": 25_000.0,
    }
    selection_response = client.post(
        "/api/v1/optimize-pit",
        files={"file": ("selection.csv", io.BytesIO(df.to_csv(index=False).encode()), "text/csv")},
        data={"financial_params": json.dumps(params_with_selection)},
    )

    assert selection_response.status_code == 200
    selection_data = selection_response.json()
    assert set(selection_data) - set(data) == {"pit_selection"}
    pit_selection = selection_data["pit_selection"]
    assert [candidate["rf"] for candidate in pit_selection["candidates"]] == [0.6, 1.0]
    assert pit_selection["assumptions"]["mining_capacity_tpy"] == 25_000.0
    assert pit_selection["assumptions"]["mining_capacity_applied"] is False
    assert "End-of-year" in pit_selection["assumptions"]["discount_convention"]
    assert pit_selection["discount_rate"] == 0.1
    assert pit_selection["production_capacity_tpy"] == 10_000.0
    for candidate in pit_selection["candidates"]:
        assert candidate["npv_best"] < candidate["undiscounted_value"]
        assert candidate["npv_worst"] < candidate["undiscounted_value"]


def test_api_with_zero_discount_rate_equals_undiscounted_value():
    rows = []
    for z in range(2):
        for y in range(2):
            for x in range(2):
                rows.append({
                    "X": x * 10,
                    "Y": y * 10,
                    "Z": z * 10,
                    "DX": 10,
                    "DY": 10,
                    "DZ": 10,
                    "Grade": 1.5,
                    "Density": 2.5,
                    "RockType": "Ore",
                })
    df = pd.DataFrame(rows)
    params = {
        "commodity_price": 50000,
        "ore_mining_cost": 4500,
        "waste_mining_cost": 2500,
        "processing_cost": 4500,
        "selling_cost": 1500,
        "metallurgical_recovery": 0.9,
        "osa": 45,
        "cut_off_grade": 0.9,
        "grade_unit": "g_per_t",
        "price_unit": "per_gram",
        "revenue_factors": [0.6, 1.0],
        "production_capacity_tpy": 10_000.0,
        "discount_rate": 0.0,
    }
    response = client.post(
        "/api/v1/optimize-pit",
        files={"file": ("zero_discount.csv", io.BytesIO(df.to_csv(index=False).encode()), "text/csv")},
        data={"financial_params": json.dumps(params)},
    )
    assert response.status_code == 200
    data = response.json()
    assert "pit_selection" in data
    pit_selection = data["pit_selection"]
    assert pit_selection["discount_rate"] == 0.0
    assert pit_selection["production_capacity_tpy"] == 10_000.0
    for candidate in pit_selection["candidates"]:
        assert candidate["npv_best"] == pytest.approx(candidate["undiscounted_value"])
        assert candidate["npv_worst"] == pytest.approx(candidate["undiscounted_value"])