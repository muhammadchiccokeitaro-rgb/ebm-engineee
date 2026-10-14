import sys
import os
import pandas as pd
import numpy as np
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from core.graph_builder import build_precedence_graph_geon

def make_100k_grid():
    rows = []
    # 50 x 50 x 40 = 100,000 blocks
    for z in range(40):
        for y in range(50):
            for x in range(50):
                rows.append({
                    "X": x*10, "Y": y*10, "Z": z*10,
                    "DX": 10, "DY": 10, "DZ": 10,
                    "Grade": 1.0, "Density": 2.5, "BEV": 100.0,
                    "RockType": "Weak"
                })
    return pd.DataFrame(rows)

def run_bench():
    print("Generating grid...")
    df = make_100k_grid()
    mapping = {"Weak": 35.0, "Strong": 60.0}
    
    # Lemah di atas (Safe)
    df_safe = df.copy()
    df_safe.loc[df_safe['Z'] >= 200, 'RockType'] = "Weak"
    df_safe.loc[df_safe['Z'] < 200, 'RockType'] = "Strong"
    print("Testing Lemah di Atas (Safe)...")
    build_precedence_graph_geon(df_safe, mapping)
    
    # Acak (Unsafe)
    df_unsafe = df.copy()
    np.random.seed(42)
    df_unsafe['RockType'] = np.random.choice(["Weak", "Strong"], size=len(df_unsafe))
    print("Testing Acak (Unsafe)...")
    build_precedence_graph_geon(df_unsafe, mapping)

if __name__ == "__main__":
    run_bench()
