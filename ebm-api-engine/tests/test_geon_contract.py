import io
import json
import os
import sys

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.compact_graph import DEFAULT_GRAPH_BACKEND
from core.economic_model import calculate_bev
from core.graph_builder import build_precedence_graph
from core.pit_optimizer import optimize_pit
from main import app


client = TestClient(app)


def make_core_model():
    rows = []
    for z, rock_type in enumerate(("Lower", "Middle", "Upper")):
        for y in range(3):
            for x in range(3):
                rows.append({
                    "X": 10 * x,
                    "Y": 10 * y,
                    "Z": 10 * z,
                    "BEV": 1000.0 if (x, y, z) == (1, 1, 0) else -1.0,
                    "RockType": rock_type,
                })
    return pd.DataFrame(rows)


def make_api_model():
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
    return pd.DataFrame(rows)


def financial_params(geon_mapping):
    return {
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
        "geon_mapping": geon_mapping,
        "revenue_factors": [1.0],
    }


def post_optimization(df, params):
    return client.post(
        "/api/v1/optimize-pit",
        files={"file": ("blocks.csv", io.BytesIO(df.to_csv(index=False).encode()), "text/csv")},
        data={"financial_params": json.dumps(params)},
    )


def test_geon_rejects_rocktypes_missing_from_mapping():
    df = make_api_model()
    df["RockType"] = "UnmappedRock"
    mapping = {"MappedRock": 45.0}

    with pytest.raises(ValueError, match="UnmappedRock"):
        build_precedence_graph(df.assign(BEV=1.0), geon_mapping=mapping)

    response = post_optimization(df, financial_params(mapping))
    assert response.status_code == 400
    assert "UnmappedRock" in response.json()["detail"]


def test_geon_rejects_nonregular_grid():
    df = make_api_model()
    df["X"] = df["X"].astype(float)
    df.loc[0, "X"] = 0.5
    mapping = {"Rock": 45.0}

    with pytest.raises(ValueError, match="regular grid"):
        build_precedence_graph(df.assign(BEV=1.0), geon_mapping=mapping)

    response = post_optimization(df, financial_params(mapping))
    assert response.status_code == 400
    assert "regular grid" in response.json()["detail"]


def test_regular_geon_preserves_mined_blocks_and_objective():
    df = make_core_model()
    mapping = {"Lower": 60.0, "Middle": 45.0, "Upper": 30.0}
    expected_blocks = {
        (0, 10, 20),
        (10, 0, 20),
        (10, 10, 0),
        (10, 10, 10),
        (10, 10, 20),
        (10, 20, 20),
        (20, 10, 20),
    }

    for backend in ("compact", "networkx"):
        graph = build_precedence_graph(df, geon_mapping=mapping, backend=backend)
        result = optimize_pit(df, graph)
        selected = result[result["MINED_STATUS"] == 1]
        actual_blocks = set(map(tuple, selected[["X", "Y", "Z"]].to_numpy()))
        assert actual_blocks == expected_blocks
        assert float(selected["BEV"].sum()) == 994.0

    response = post_optimization(make_api_model(), financial_params({"Rock": 45.0}))
    assert response.status_code == 200
    graph_info = response.json()["graph_info"]
    assert graph_info == {
        "mode": "geon",
        "backend": DEFAULT_GRAPH_BACKEND if DEFAULT_GRAPH_BACKEND in ("compact", "networkx") else "networkx",
        "fallback_used": False,
        "reason": None,
    }


def test_global_nonregular_kdtree_fallback_is_reported():
    df = make_api_model()
    df["X"] = df["X"].astype(float)
    df.loc[0, "X"] = 0.5
    params = financial_params(None)

    response = post_optimization(df, params)

    assert response.status_code == 200
    graph_info = response.json()["graph_info"]
    assert graph_info["mode"] == "global"
    assert graph_info["backend"] == (
        DEFAULT_GRAPH_BACKEND if DEFAULT_GRAPH_BACKEND in ("compact", "networkx") else "networkx"
    )
    assert graph_info["fallback_used"] is True
    assert graph_info["reason"] == "non_regular_grid_full_kdtree"