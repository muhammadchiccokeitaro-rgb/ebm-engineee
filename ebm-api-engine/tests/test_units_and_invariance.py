import pytest
import numpy as np
import pandas as pd
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from models.schemas import FinancialParameters
from core.economic_model import calculate_bev
from core.graph_builder import build_precedence_graph
from core.pit_optimizer import optimize_pit
from tests.test_graph_builder_validation import test_b_c_exact_pit_and_geometry
from tests.test_minelib_validation import test_minelib_newman1

from main import apply_column_aliases, read_csv_robust

CSV_PATH = r"C:\Users\Chicco\Documents\MINEBIT\EBM (Economic Boundary Machine)\Model_Blok_Natural.csv"

def load_test_csv():
    if not os.path.exists(CSV_PATH):
        pytest.skip(f"Test data CSV not found: {CSV_PATH}")
    with open(CSV_PATH, 'rb') as f:
        content = f.read()
    df = read_csv_robust(content).fillna(0)
    return apply_column_aliases(df)

def test_a_default_identity():
    df = load_test_csv()
    if 'Volume' not in df.columns:
        df['Volume'] = df['DX'] * df['DY'] * df['DZ']
    if 'Tonase' not in df.columns:
        df['Tonase'] = df['Volume'] * df['Density']
    
    rev_old = df['Tonase'] * df['Grade'] * 0.9 * 50000.0
    cost_ore_old = df['Tonase'] * (45000.0 * (df['Density']/2.5) + 4500.0 + 15000.0)
    bev_ore_old = rev_old - cost_ore_old
    cost_waste_old = df['Tonase'] * (2500.0 * (df['Density']/2.5))
    bev_waste_old = -1.0 * cost_waste_old
    bev_old = np.maximum(bev_ore_old.values, bev_waste_old.values)
    
    params = FinancialParameters(
        commodity_price=50000, ore_mining_cost=45000, waste_mining_cost=2500,
        processing_cost=4500, selling_cost=15000, metallurgical_recovery=0.9,
        osa=45, cut_off_grade=0.9, grade_unit="g_per_t", price_unit="per_gram", currency="IDR"
    )
    df_new = calculate_bev(df, params)
    
    np.testing.assert_allclose(df_new['BEV'].values, bev_old, rtol=1e-12)
    
    g = build_precedence_graph(df_new, params.osa)
    res = optimize_pit(df_new, g)
    mined_count = res['MINED_STATUS'].sum()
    pit_value = res[res['MINED_STATUS'] == 1]['BEV'].sum()
    
    print(f"\n[4a] Default Identity: MINED_STATUS count={mined_count}, Pit Value={pit_value:.2f}")
    assert mined_count > 0

def test_b_hand_calculation():
    df = load_test_csv()
    params = FinancialParameters(
        commodity_price=50000, ore_mining_cost=45000, waste_mining_cost=2500,
        processing_cost=4500, selling_cost=15000, metallurgical_recovery=0.9,
        osa=45, cut_off_grade=0.9, grade_unit="g_per_t", price_unit="per_gram", currency="IDR"
    )
    df_bev = calculate_bev(df, params)
    
    ore_blocks = df_bev[df_bev['Destination'] == 'Ore']
    first_ore = ore_blocks.iloc[0]
    
    tonnage = first_ore['Tonase']
    grade = first_ore['Grade']
    rec = 0.9
    price = 50000.0
    
    grade_frac = grade / 1e6
    price_t_metal = price * 1e6
    expected_rev = tonnage * grade_frac * rec * price_t_metal
    
    density_factor = first_ore['Density'] / 2.5
    expected_cost = tonnage * (45000.0 * density_factor + 4500.0 + 15000.0)
    expected_bev = expected_rev - expected_cost
    
    print(f"\n[4b] Hand Calc Blok Ore Pertama (index {first_ore.name}):")
    print(f"  Tonase: {tonnage:.2f} t")
    print(f"  Revenue Kode: {first_ore['BEV_Ore'] + expected_cost:.2f}, Hand: {expected_rev:.2f}")
    print(f"  Biaya Ore Kode: {expected_cost:.2f}")
    print(f"  BEV Kode: {first_ore['BEV']:.2f}, Hand: {expected_bev:.2f}")
    
    assert abs(first_ore['BEV'] - expected_bev) < 1e-5

def test_c_unit_invariance():
    df = load_test_csv()
    
    p1 = FinancialParameters(
        commodity_price=50000, ore_mining_cost=45000, waste_mining_cost=2500,
        processing_cost=4500, selling_cost=15000, metallurgical_recovery=0.9,
        osa=45, cut_off_grade=0.9, grade_unit="g_per_t", price_unit="per_gram", currency="IDR"
    )
    bev1 = calculate_bev(df, p1)['BEV'].values
    
    df2 = df.copy()
    df2['Grade'] = df2['Grade'] / 10000.0 # g/t to %
    p2 = FinancialParameters(
        commodity_price=50000 * 1e6, ore_mining_cost=45000, waste_mining_cost=2500,
        processing_cost=4500, selling_cost=15000, metallurgical_recovery=0.9,
        osa=45, cut_off_grade=0.9/10000.0, grade_unit="percent", price_unit="per_t_metal", currency="IDR"
    )
    bev2 = calculate_bev(df2, p2)['BEV'].values
    
    np.testing.assert_allclose(bev1, bev2, rtol=1e-9)
    print("\n[4c] Unit Invariance (g/t + per_gram vs % + per_t_metal): MATCH (rtol < 1e-9)")

def test_d_regression_minelib_and_testb():
    print("\n[4d] Running MineLib newman1 and Test B regression...")
    test_minelib_newman1()
    test_b_c_exact_pit_and_geometry(50)
    print("[4d] MineLib newman1 and Test B PASSED")

if __name__ == "__main__":
    sys.exit(pytest.main(["-s", __file__]))
