import sys
sys.path.append("c:/Users/Chicco/.gemini/antigravity/scratch/ebm-engine-app/ebm-api-engine")

import pandas as pd
import numpy as np
from core.economic_model import calculate_bev
from models.schemas import FinancialParameters
from utils.minelib_parser import parse_blocks

def main():
    print("--- TUGAS 4: CEK MAGNITUDO BEV ---")
    
    # Gunakan newman1.blocks sebagai contoh CSV
    df = parse_blocks("c:/Users/Chicco/.gemini/antigravity/scratch/ebm-engine-app/ebm-api-engine/newman1_data/newman1.blocks")
    
    # Mapping agar sesuai schema economic_model (Grade, Density, DX, DY, DZ)
    # Newman1 punya: grade, tonns, min_caf dll. Kita buat dummy mapping
    df['Grade'] = df['grade']
    df['Density'] = 2.5
    df['Volume'] = df['tonns'] / df['Density']
    df['Tonase'] = df['tonns']
    
    params = FinancialParameters(
        commodity_price=10.0,
        ore_mining_cost=1.5,
        waste_mining_cost=1.5,
        processing_cost=5.0,
        selling_cost=0.5,
        metallurgical_recovery=0.9,
        osa=45.0,
        cut_off_grade=0.5
    )
    
    df_res = calculate_bev(df, params)
    
    bev_vals = df_res['BEV'].values
    abs_bev = np.abs(bev_vals)
    
    print(f"Jumlah Blok: {len(df_res)}")
    print(f"BEV Min    : {np.min(bev_vals):.4f}")
    print(f"BEV Max    : {np.max(bev_vals):.4f}")
    print(f"|BEV| Min  : {np.min(abs_bev):.4f}")
    print(f"|BEV| Max  : {np.max(abs_bev):.4f}")
    print(f"|BEV| Median: {np.median(abs_bev):.4f}")
    
    under_05 = np.sum(abs_bev < 0.5)
    print(f"Jumlah blok dengan |BEV| < 0.5: {under_05}")
    print("Satuan BEV: Tergantung pada parameter FinancialParameters (USD). Karena tonase ada di angka jutaan, BEV juga dalam USD jutaan.")

if __name__ == "__main__":
    main()
