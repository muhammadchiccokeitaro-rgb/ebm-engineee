import sys
sys.path.append("c:/Users/Chicco/.gemini/antigravity/scratch/ebm-engine-app/ebm-api-engine")
import numpy as np
import pandas as pd
import time
from core.graph_builder import build_precedence_graph

def make_grid(nx_c, ny_c, nz_c, dx=10.0, dy=10.0, dz=10.0):
    xs, ys, zs = np.meshgrid(
        np.arange(nx_c) * dx,
        np.arange(ny_c) * dy,
        np.arange(nz_c) * dz,
        indexing='ij'
    )
    df = pd.DataFrame({
        'X': xs.flatten(), 'Y': ys.flatten(),
        'Z': zs.flatten(), 'BEV': np.zeros(nx_c * ny_c * nz_c)
    })
    return df

sizes = [
    (50, 50, 40, 30),   # 100k, OSA 30
    (50, 50, 40, 45),   # 100k, OSA 45
    (50, 50, 40, 60),   # 100k, OSA 60
]

print(f"{'Blok':>10} | {'OSA':>3} | {'Waktu (s)':>10} | {'Edge':>12} | {'Edge/Blok':>10}")
for nx_c, ny_c, nz_c, osa in sizes:
    df = make_grid(nx_c, ny_c, nz_c)
    n_blocks = len(df)
    t0 = time.time()
    try:
        G = build_precedence_graph(df, osa)
        t1 = time.time()
        print(f"{n_blocks:>10} | {osa:>3} | {t1-t0:>10.3f} | {G.number_of_edges():>12} | {G.number_of_edges()/n_blocks:>10.1f}")
    except Exception as e:
        print(f"{n_blocks:>10} | {osa:>3} | {'ERROR':>10} | {str(e)[:30]}")
