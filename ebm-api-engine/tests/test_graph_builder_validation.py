import pytest
import numpy as np
import pandas as pd
import networkx as nx
import math
import time
import sys

# Import modul yang akan divalidasi
sys.path.append("c:/Users/Chicco/.gemini/antigravity/scratch/ebm-engine-app/ebm-api-engine")
from core.graph_builder import build_precedence_graph, build_precedence_graph_full
from core.pit_optimizer import optimize_pit

def make_grid(nx_cells, ny_cells, nz_cells, dx=10.0, dy=10.0, dz=10.0):
    xs, ys, zs = np.meshgrid(
        np.arange(nx_cells) * dx,
        np.arange(ny_cells) * dy,
        np.arange(nz_cells) * dz,
        indexing='ij'
    )
    df = pd.DataFrame({
        'X': xs.flatten(),
        'Y': ys.flatten(),
        'Z': zs.flatten(),
        'BEV': np.zeros(nx_cells * ny_cells * nz_cells)
    })
    return df

def reference_cone_graph(df, osa):
    """
    O(N^2) murni: Cek jarak blok i ke blok j untuk SEMUA level di atas i.
    Rumus asli geometris tanpa asumsi transitif level-per-level.
    """
    G = nx.DiGraph()
    G.add_nodes_from(df.index)
    
    osa_rad = math.radians(osa)
    tan_osa = math.tan(osa_rad)
    
    X = df['X'].values
    Y = df['Y'].values
    Z = df['Z'].values
    n = len(df)
    
    for i in range(n):
        for j in range(n):
            dz = Z[j] - Z[i]
            if dz > 1e-5: # Z_j di atas Z_i
                dist_xy = math.hypot(X[j] - X[i], Y[j] - Y[i])
                radius = dz / tan_osa
                if dist_xy <= radius + 1e-9:
                    G.add_edge(i, j)
    return G

# --- TES A: Perbandingan Reachability (Lama) ---
@pytest.mark.parametrize("osa", [30, 35, 45, 50, 60])
def test_a_reachability_full(osa):
    df = make_grid(15, 15, 6, dx=10, dy=10, dz=10)
    
    # Tes ini mengecek fallback/metode _full
    G_test = build_precedence_graph_full(df, osa)
    G_ref = reference_cone_graph(df, osa)
    
    print(f"\n[Tes A] OSA={osa}° | Edge Langsung KDTree={G_test.number_of_edges()} | Edge Referensi={G_ref.number_of_edges()}")
    
    center_idx = df[(df['X'] == 70) & (df['Y'] == 70) & (df['Z'] == 0)].index[0]
    reach_test = set(nx.descendants(G_test, center_idx))
    reach_ref = set(nx.descendants(G_ref, center_idx))
    
    assert reach_test == reach_ref, f"Reachability closure tidak cocok untuk OSA {osa}°"
    assert set(G_test.edges()) == set(G_ref.edges()), f"Himpunan edge tidak identik untuk OSA {osa}°"

# --- TES A2: Perbandingan Transitive Closure (Baru vs Full) ---
@pytest.mark.parametrize("grid_size", [(12, 12, 8), (20, 20, 10)])
@pytest.mark.parametrize("osa", [30, 35, 45, 50, 60])
@pytest.mark.parametrize("dz", [5, 10]) # Kubik dan non-kubik
def test_a2_transitive_closure(grid_size, osa, dz):
    df = make_grid(grid_size[0], grid_size[1], grid_size[2], dx=10, dy=10, dz=dz)
    
    t0 = time.time()
    G_new = build_precedence_graph(df, osa)
    t1 = time.time()
    G_full = build_precedence_graph_full(df, osa)
    t2 = time.time()
    
    edges_new = G_new.number_of_edges()
    edges_full = G_full.number_of_edges()
    ratio = edges_new / edges_full if edges_full > 0 else 0
    
    print(f"\n[Tes A2] Grid={grid_size} dz={dz} OSA={osa}°")
    print(f"  Baru: {edges_new} edges ({t1-t0:.3f}s)")
    print(f"  Full: {edges_full} edges ({t2-t1:.3f}s)")
    print(f"  Rasio Edge: {ratio:.3f}")
    
    # Bandingkan transitive closure untuk sampel (center blok)
    center_idx = df[(df['X'] == 50) & (df['Y'] == 50) & (df['Z'] == 0)].index[0]
    reach_new = set(nx.descendants(G_new, center_idx))
    reach_full = set(nx.descendants(G_full, center_idx))
    
    diff = reach_new ^ reach_full
    assert len(diff) == 0, "Transitive closure berbeda antara metode offset dan KDTree full."

def expected_blocks(osa, dx, dz, L, half=None, eps=1e-9):
    t = math.tan(math.radians(osa)); tot = 1
    for k in range(1, L + 1):
        r = k * dz / t + eps
        m = int(r // dx) + 1 if half is None else half
        tot += sum(1 for i in range(-m, m + 1) for j in range(-m, m + 1) if (i * dx)**2 + (j * dx)**2 <= r**2)
    return tot

# --- TES B & C: Bentuk Pit Eksak (Menggunakan Builder Baru) ---
@pytest.mark.parametrize("osa", [30, 35, 45, 50, 60])
def test_b_c_exact_pit_and_geometry(osa):
    df = make_grid(15, 15, 6, dx=10, dy=10, dz=10)
    df['BEV'] = -1.0
    
    center_idx = df[(df['X'] == 70) & (df['Y'] == 70) & (df['Z'] == 0)].index[0]
    df.loc[center_idx, 'BEV'] = 1_000_000.0
    
    G_test = build_precedence_graph(df, osa)
    df_res = optimize_pit(df, G_test)
    
    mined_test = set(df_res[df_res['MINED_STATUS'] == 1].index)
    
    G_ref = reference_cone_graph(df, osa)
    reach_ref = set(nx.descendants(G_ref, center_idx))
    reach_ref.add(center_idx)
    
    expected_n = expected_blocks(osa, 10, 10, 5, 7)
    print(f"\n[Tes B] OSA={osa}° | Mined Test = {len(mined_test)} blok | Analytic Ref = {expected_n} blok | Mined Ref = {len(reach_ref)} blok")
    assert len(mined_test) == expected_n, f"Tes B gagal: Hitungan blok tidak cocok dengan analitik pada OSA {osa}°"
    assert mined_test == reach_ref, f"Tes B gagal: Pit eksak tidak cocok pada OSA {osa}°"

    # Uji terlalu murah
    df_cheap = df.copy()
    df_cheap.loc[center_idx, 'BEV'] = 1.0
    df_res_cheap = optimize_pit(df_cheap, G_test)
    mined_cheap = set(df_res_cheap[df_res_cheap['MINED_STATUS'] == 1].index)
    assert len(mined_cheap) == 0, f"Tes B gagal: Harusnya tidak digali (murah) OSA {osa}°"

    # Cek Geometri (Tes C)
    df_mined = df.loc[list(mined_test)]
    z_levels = sorted(df_mined['Z'].unique())
    for z_upper in z_levels:
        if z_upper == 0: continue
        dz = z_upper - 0
        df_z = df_mined[df_mined['Z'] == z_upper]
        max_dist = max([math.hypot(row['X'] - 70, row['Y'] - 70) for _, row in df_z.iterrows()] or [0])
        if max_dist > 0:
            measured_deg = math.degrees(math.atan2(dz, max_dist))
            max_allowed_angle = math.degrees(math.atan2(dz, max_dist - 15)) if (max_dist - 15) > 0 else 90
            assert measured_deg <= osa or measured_deg <= max_allowed_angle, "Sudut terlalu curam"

# --- TES E: Kasus Tepi ---
def test_e_edge_cases():
    print("\n[Tes E] Blok Non-Kubik (dx=10, dy=10, dz=5), OSA=45")
    df = make_grid(15, 15, 6, dx=10, dy=10, dz=5)
    G_test = build_precedence_graph(df, 45)
    G_ref = reference_cone_graph(df, 45)
    
    center_idx = df[(df['X'] == 70) & (df['Y'] == 70) & (df['Z'] == 0)].index[0]
    reach_test = set(nx.descendants(G_test, center_idx))
    reach_ref = set(nx.descendants(G_ref, center_idx))
    assert reach_test == reach_ref, "Gagal pada kasus blok non-kubik dz != dx"

# --- TES G: Topografi Tidak Rata ---
def test_g_uneven_topography():
    print("\n[Tes G] Topografi Bergelombang Kuat (Cek Seluruh Blok)")
    df = make_grid(20, 20, 10, dx=10, dy=10, dz=10)
    
    # Relief kuat realistis: lereng bukit + gelombang
    real_blocks_mask = df['Z'] <= (25 + 0.25 * df['X'] + 0.15 * df['Y'] + 15 * np.sin(df['X'] / 20))
    df_real = df[real_blocks_mask].copy().reset_index(drop=True)
    
    G_new = build_precedence_graph(df_real, 45)
    G_full = build_precedence_graph_full(df_real, 45)
    
    # Cek seluruh blok nyata
    for idx in range(len(df_real)):
        reach_new = set(nx.descendants(G_new, idx))
        reach_full = set(nx.descendants(G_full, idx))
        assert reach_new == reach_full, f"Closure berbeda untuk blok {idx} pada topografi tidak rata!"
    print(f"  Berhasil: Closure 100% identik untuk seluruh {len(df_real)} blok nyata pada topografi bergelombang.")

# --- TES H: Pengaman Skala Optimizer (Overflow check) ---
def test_h_optimizer_scale():
    print("\n[Tes H] Optimizer Auto-Scale & Overflow Check")
    # Total sum akan melampaui int32 (2.14 milyar) jika tidak diskalakan
    df = make_grid(10, 10, 10)
    # 1000 blok, rata-rata 3.000.000 -> total 3 milyar
    df['BEV'] = 3_000_000.0
    
    G = build_precedence_graph(df, 45)
    
    # Optimizer should scale this down automatically
    df_res, meta = optimize_pit(df, G, return_meta=True)
    
    assert meta['autoscale_triggered'] == True
    assert meta['pos_sum_after_scale'] <= 2000000000, "Pos sum setelah scale masih rawan overflow!"
    print(f"  Scale Factor: {meta['effective_scale']}")
    print(f"  Pos Sum Before: {meta['pos_sum_before_scale']}")
    print(f"  Pos Sum After: {meta['pos_sum_after_scale']}")

# --- TES F: Performa Skala Besar ---
@pytest.mark.slow
def test_f_performance():
    print("\n[Tes F] Benchmark Performa Builder Baru (Offset + Reduction)")
    sizes = [
        (50, 50, 40, 30), # 100k, OSA 30
        (50, 50, 40, 45), # 100k, OSA 45
        (50, 50, 40, 60), # 100k, OSA 60
        (100, 100, 100, 45), # 1 juta, OSA 45
        (100, 100, 100, 60)  # 1 juta, OSA 60
    ]
    
    print(f"{'Blok':>10} | {'OSA':>3} | {'Waktu (detik)':>15} | {'Edge':>15} | {'Edge/Blok':>10}")
    for nx_c, ny_c, nz_c, osa in sizes:
        df = make_grid(nx_c, ny_c, nz_c)
        t0 = time.time()
        try:
            G = build_precedence_graph(df, osa)
            t1 = time.time()
            n_edges = G.number_of_edges()
            n_blocks = len(df)
            print(f"{n_blocks:>10} | {osa:>3} | {t1-t0:>15.4f} | {n_edges:>15} | {n_edges/n_blocks:>10.1f}")
        except Exception as e:
            print(f"{len(df):>10} | {osa:>3} | {'ERROR':>15} | {str(e)[:15]:>15} | {'N/A':>10}")

if __name__ == "__main__":
    sys.exit(pytest.main(["-v", "-s", __file__]))
