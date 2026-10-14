import pandas as pd
import numpy as np
from models.schemas import FinancialParameters

def calculate_bev(df: pd.DataFrame, params: FinancialParameters) -> pd.DataFrame:
    """
    Fase 1: Kalkulasi Nilai Ekonomi Blok (Block Economic Value / BEV)
    Menghitung BEV untuk setiap blok sebagai Ore atau Waste, lalu mengambil nilai maksimum.
    
    Persyaratan Kolom di df:
    - Grade
    - Density
    - DX, DY, DZ (untuk kalkulasi Volume, jika Tonase belum ada)
    - RockType

    Model_Type is the cutoff-grade label: Ore when Grade >= cut_off_grade,
    otherwise Waste. Destination is selected independently by comparing
    BEV_Ore and BEV_Waste; it is Ore when BEV_Ore >= BEV_Waste, otherwise
    Waste. Therefore a below-cutoff block can have Model_Type='Waste' and
    Destination='Ore' when its ore BEV is greater than its waste BEV.
    """
    df = df.copy()
    
    # Hitung volume dan tonase jika kolom Tonase belum ada
    if 'Volume' not in df.columns:
        df['Volume'] = df['DX'] * df['DY'] * df['DZ']
    if 'Tonase' not in df.columns:
        df['Tonase'] = df['Volume'] * df['Density']
        
    # --- BEV jika digali sebagai Ore ---
    # Normalisasi satuan grade dan harga komoditas
    grade_divisors = {"fraction": 1.0, "percent": 100.0, "g_per_t": 1e6, "ppm": 1e6}
    price_factors = {"per_t_metal": 1.0, "per_kg": 1e3, "per_gram": 1e6, "per_troy_oz": 1e6 / 31.1035}
    
    grade_fraction = df['Grade'] / grade_divisors.get(params.grade_unit, 1e6)
    price_per_t_metal = params.commodity_price * price_factors.get(params.price_unit, 1e6)
    
    revenue = df['Tonase'] * grade_fraction * params.metallurgical_recovery * price_per_t_metal
    
    # Cost = Tonase * (Effective Ore Mining Cost + Processing Cost + Selling Cost)
    # Effective Mining Cost = Base Cost * (Density / 2.5)
    density_factor = df['Density'] / 2.5
    effective_ore_mining_cost = params.ore_mining_cost * density_factor
    
    cost_ore = df['Tonase'] * (effective_ore_mining_cost + params.processing_cost + params.selling_cost)
    
    bev_ore = revenue - cost_ore
    
    # --- BEV jika digali sebagai Waste ---
    # BEV_Waste = -1 * Tonase * Effective Waste Mining Cost
    effective_waste_mining_cost = params.waste_mining_cost * density_factor
    bev_waste = -1.0 * df['Tonase'] * effective_waste_mining_cost
    
    # Keputusan (Ore atau Waste): Bandingkan BEV_Ore dan BEV_Waste
    # Blok akan diproses sebagai ore jika BEV_Ore > BEV_Waste dan blok adalah ore (Grade > 0 atau RockType == 'Ore')
    # Untuk fleksibilitas, kita simpan BEV maksimum untuk setiap blok.
    
    df['BEV_Ore'] = bev_ore
    df['BEV_Waste'] = bev_waste

    # Vectorized — jauh lebih cepat dari apply(lambda)
    df['BEV'] = np.maximum(bev_ore.values, bev_waste.values)
    df['Destination'] = np.where(bev_ore.values >= bev_waste.values, 'Ore', 'Waste')
    # cut_off_grade memakai grade_unit yang sama dengan Grade (dibandingkan langsung)
    df['Model_Type']  = np.where(df['Grade'].values >= params.cut_off_grade, 'Ore', 'Waste')

    return df
