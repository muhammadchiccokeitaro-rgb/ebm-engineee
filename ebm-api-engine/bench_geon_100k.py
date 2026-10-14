import time
import pandas as pd
import numpy as np
from core.graph_builder import build_precedence_graph

def run_benchmark():
    # Buat grid 100k blocks (50x50x40)
    nx_c, ny_c, nz_c = 50, 50, 40
    print(f"Generating 100k grid ({nx_c}x{ny_c}x{nz_c} = {nx_c*ny_c*nz_c} blocks)...")
    
    rows = []
    for z in range(nz_c):
        for y in range(ny_c):
            for x in range(nx_c):
                rows.append({
                    "X": x*10, "Y": y*10, "Z": z*10,
                    "DX": 10, "DY": 10, "DZ": 10,
                    "RockType": "SemuaRockType",
                    "Grade": 1.0,
                    "Density": 2.5,
                    "BEV": 100.0
                })
    df = pd.DataFrame(rows)
    
    # 3 Domains
    df.loc[df['Z'] < 100, 'RockType'] = "Bedrock"
    df.loc[(df['Z'] >= 100) & (df['Z'] < 300), 'RockType'] = "Saprolite"
    df.loc[df['Z'] >= 300, 'RockType'] = "Limonite"
    
    mapping = {
        "Bedrock": 60.0,
        "Saprolite": 45.0,
        "Limonite": 35.0
    }
    
    t0 = time.time()
    G = build_precedence_graph(df, geon_mapping=mapping)
    t1 = time.time()
    
    print("\nBENCHMARK RESULT:")
    print(f"Blocks: {len(df)}")
    print(f"Domains: {len(mapping)}")
    print(f"Nodes: {G.number_of_nodes()}")
    print(f"Final Edges: {G.number_of_edges()}")
    print(f"Runtime: {t1-t0:.4f} detik")

if __name__ == "__main__":
    run_benchmark()
