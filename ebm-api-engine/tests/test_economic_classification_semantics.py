import os
import sys

import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models.schemas import FinancialParameters
from core.economic_model import calculate_bev


def test_model_type_uses_cutoff_while_destination_uses_bev_comparison():
    df = pd.DataFrame([{
        "X": 0.0,
        "Y": 0.0,
        "Z": 0.0,
        "DX": 1.0,
        "DY": 1.0,
        "DZ": 1.0,
        "Grade": 0.4,
        "Density": 2.5,
        "RockType": "Rock",
    }])
    params = FinancialParameters(
        commodity_price=100.0,
        ore_mining_cost=5.0,
        waste_mining_cost=10.0,
        processing_cost=3.0,
        selling_cost=2.0,
        metallurgical_recovery=1.0,
        osa=45.0,
        cut_off_grade=0.5,
        grade_unit="fraction",
        price_unit="per_t_metal",
    )

    result = calculate_bev(df, params).iloc[0]

    assert result["BEV_Ore"] == 75.0
    assert result["BEV_Waste"] == -25.0
    assert result["BEV"] == 75.0
    assert result["Model_Type"] == "Waste"
    assert result["Destination"] == "Ore"