import io
import itertools
import json
import os
import sys

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.compact_graph import CompactGraph
from core.pit_optimizer import optimize_pit
from main import app


client = TestClient(app)


def brute_force_closure(values, edges):
    candidates = []
    for selected in itertools.product((False, True), repeat=len(values)):
        if all(not selected[u] or selected[v] for u, v in edges):
            objective = sum(value for value, mined in zip(values, selected) if mined)
            candidates.append((objective, selected))
    return max(candidates, key=lambda candidate: candidate[0])


def test_n_clipped_counts_values_actually_clipped():
    df = pd.DataFrame({"BEV": [1_000_000.0, -3_000_000.0]})
    graph = CompactGraph([], [], num_nodes=2, node_indices=np.arange(2, dtype=np.int32))

    _, meta = optimize_pit(df, graph, return_meta=True)

    assert meta["n_clipped"] == 1
    assert meta["effective_scale"] == 1000.0
    assert meta["max_rounding_error_per_block"] == 0.5 / meta["effective_scale"]


def test_integer_optimizer_matches_brute_force_above_resolution():
    edges = {(0, 1)}
    graph = CompactGraph(
        np.array([0], dtype=np.int32),
        np.array([1], dtype=np.int32),
        num_nodes=3,
        node_indices=np.arange(3, dtype=np.int32),
    )

    for multiplier in (1.0, 1_000_000.0, 10_000_000_000.0):
        values = np.array([5.0, -1.25, 2.5]) * multiplier
        df = pd.DataFrame({"BEV": values})
        result, meta = optimize_pit(df, graph, return_meta=True)
        exact_objective, exact_selected = brute_force_closure(values, edges)
        actual_selected = tuple(result["MINED_STATUS"].astype(bool))
        resolution = 1.0 / meta["effective_scale"]

        assert np.all(np.abs(values) >= resolution)
        assert actual_selected == exact_selected
        assert float((result["BEV"] * result["MINED_STATUS"]).sum()) == exact_objective
        assert meta["max_rounding_error_per_block"] == 0.5 / meta["effective_scale"]


def test_subresolution_value_is_reported_without_asserting_optimum():
    df = pd.DataFrame({"BEV": [0.0004]})
    graph = CompactGraph([], [], num_nodes=1, node_indices=np.arange(1, dtype=np.int32))

    _, meta = optimize_pit(df, graph, return_meta=True)

    assert abs(float(df.loc[0, "BEV"])) < 1.0 / meta["effective_scale"]
    assert meta["max_rounding_error_per_block"] == 0.5 / meta["effective_scale"]


def test_api_returns_precision_metadata_for_each_revenue_factor():
    rows = []
    for z in range(3):
        for y in range(3):
            for x in range(3):
                rows.append({
                    "X": 10 * x,
                    "Y": 10 * y,
                    "Z": 10 * z,
                    "DX": 10,
                    "DY": 10,
                    "DZ": 10,
                    "Grade": 1.5,
                    "Density": 2.5,
                    "RockType": "Rock",
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
        "grade_unit": "g_per_t",
        "price_unit": "per_gram",
        "revenue_factors": [0.6, 1.0],
    }
    response = client.post(
        "/api/v1/optimize-pit",
        files={"file": ("blocks.csv", io.BytesIO(df.to_csv(index=False).encode()), "text/csv")},
        data={"financial_params": json.dumps(params)},
    )

    assert response.status_code == 200
    metadata = response.json()["optimizer_meta"]
    assert [item["rf"] for item in metadata] == [0.6, 1.0]
    for item in metadata:
        assert item["effective_scale"] > 0
        assert item["max_rounding_error_per_block"] == 0.5 / item["effective_scale"]
        assert item["n_clipped"] >= 0