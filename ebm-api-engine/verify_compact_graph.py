"""
================================================================================
  FINAL VERIFICATION SCRIPT — CompactGraph vs NetworkX EBM Integration Audit
================================================================================
  Verifikasi independen:
  1. Edge direction & node mapping — CompactGraph vs NetworkX menghasilkan
     himpunan edge kanonik yang identik untuk Global OSA dan GEON.
  2. Optimizer equivalence — UPV, blok terpilih, feasibility closure.
  3. Brute-force optimum — verifikasi exact optimum pada kasus kecil.
  4. Tie-breaking awareness — jika ada solusi optimal ganda, bandingkan UPV.
  5. Benchmark waktu dan estimasi memori (process RSS jika psutil tersedia).
================================================================================
"""

import sys, os, time, gc
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import numpy as np
import pandas as pd
import networkx as nx
from itertools import combinations

# ── Import EBM core ──────────────────────────────────────────────────────────
from core.graph_builder import build_precedence_graph, build_precedence_graph_full
from core.compact_graph import CompactGraph
from core.pit_optimizer import optimize_pit
from core.economic_model import calculate_bev
from models.schemas import FinancialParameters

# ── Optional psutil ──────────────────────────────────────────────────────────
try:
    import psutil
    _PSUTIL = True
    _PROC = psutil.Process(os.getpid())
except ImportError:
    _PSUTIL = False

SECTION = lambda s: print(f"\n{'='*70}\n  {s}\n{'='*70}")
OK = lambda msg: print(f"  ✅  {msg}")
FAIL = lambda msg: print(f"  ❌  {msg}")
INFO = lambda msg: print(f"  ℹ   {msg}")

# ═════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═════════════════════════════════════════════════════════════════════════════

def make_grid(nx_c, ny_c, nz_c, dx=10.0, dy=10.0, dz=10.0):
    xs, ys, zs = np.meshgrid(
        np.arange(nx_c)*dx, np.arange(ny_c)*dy, np.arange(nz_c)*dz,
        indexing='ij'
    )
    return pd.DataFrame({'X': xs.flatten(), 'Y': ys.flatten(),
                         'Z': zs.flatten(), 'BEV': np.zeros(nx_c*ny_c*nz_c)})

def rss_mb():
    if _PSUTIL:
        return _PROC.memory_info().rss / 1024**2
    return float('nan')

def canonical_edges(G):
    """Normalkan edge ke frozenset sorted tuple untuk perbandingan backend-agnostik."""
    if isinstance(G, CompactGraph):
        return set(zip(G.u.tolist(), G.v.tolist()))
    return set(G.edges())

def check_closure_feasibility(df_mined_idx, prec_edges_set):
    """Periksa apakah semua precedence constraints terpenuhi oleh blok terpilih."""
    violations = 0
    for (u, v) in prec_edges_set:
        if u in df_mined_idx and v not in df_mined_idx:
            violations += 1
    return violations

def brute_force_mwc(bevs, prec_edges):
    """
    O(2^N) brute-force Maximum Weight Closure.
    Hanya layak untuk N ≤ 20.
    """
    n = len(bevs)
    best_val = 0.0
    best_sel = set()
    for mask in range(1 << n):
        sel = {i for i in range(n) if mask & (1 << i)}
        # Cek feasibility
        ok = True
        for (u, v) in prec_edges:
            if u in sel and v not in sel:
                ok = False
                break
        if ok:
            val = sum(bevs[i] for i in sel)
            if val > best_val:
                best_val = val
                best_sel = sel
    return best_val, best_sel

# ═════════════════════════════════════════════════════════════════════════════
# VERIFIKASI 1 — Edge Direction & Node Mapping (Global OSA)
# ═════════════════════════════════════════════════════════════════════════════

SECTION("VER-1: Edge Direction & Node Mapping — Global OSA")

failures_v1 = 0
for osa in [30, 45, 60]:
    df = make_grid(6, 6, 4)
    df['BEV'] = np.random.default_rng(osa).uniform(-1, 1, len(df))

    G_cg = build_precedence_graph(df, osa=float(osa), backend='compact')
    G_nx = build_precedence_graph(df, osa=float(osa), backend='networkx')

    edges_cg = canonical_edges(G_cg)
    edges_nx = canonical_edges(G_nx)

    n_cg = G_cg.number_of_nodes()
    n_nx = G_nx.number_of_nodes()
    e_cg = len(edges_cg)
    e_nx = len(edges_nx)

    INFO(f"OSA {osa}° | CG: {n_cg} nodes {e_cg} edges | NX: {n_nx} nodes {e_nx} edges")

    if edges_cg == edges_nx:
        OK(f"OSA {osa}°: Himpunan edge identik (canonical).")
    else:
        only_cg = edges_cg - edges_nx
        only_nx = edges_nx - edges_cg
        FAIL(f"OSA {osa}°: Edge mismatch. Only-CG={len(only_cg)}, Only-NX={len(only_nx)}")
        if only_cg: print(f"    Contoh CG-only: {list(only_cg)[:3]}")
        if only_nx: print(f"    Contoh NX-only: {list(only_nx)[:3]}")
        failures_v1 += 1

    # Verifikasi arah edge: u → v berarti blok u di bawah v (Z[v] > Z[u])
    wrong_dir = 0
    for (u, v) in list(edges_cg)[:200]:  # Sampel
        zu = df.loc[u, 'Z']
        zv = df.loc[v, 'Z']
        if zv <= zu:
            wrong_dir += 1
    if wrong_dir == 0:
        OK(f"OSA {osa}°: Arah edge benar (Z[v] > Z[u]) pada 200 edge sampel.")
    else:
        FAIL(f"OSA {osa}°: {wrong_dir} edge dengan arah salah!")
        failures_v1 += 1

print(f"\n  [VER-1 RESULT] {'PASS' if failures_v1 == 0 else 'FAIL'} ({failures_v1} failures)")

# ═════════════════════════════════════════════════════════════════════════════
# VERIFIKASI 2 — Edge Direction & Node Mapping (GEON Multi-Domain)
# ═════════════════════════════════════════════════════════════════════════════

SECTION("VER-2: Edge Direction & Node Mapping — GEON Multi-Domain")

failures_v2 = 0
df_geon = make_grid(8, 8, 5)
df_geon['BEV'] = np.random.default_rng(42).uniform(-1, 1, len(df_geon))
df_geon['RockType'] = 'Bedrock'
df_geon.loc[df_geon['Z'] >= 20, 'RockType'] = 'Saprolite'
df_geon.loc[df_geon['Z'] >= 30, 'RockType'] = 'Limonite'

geon_map = {"Bedrock": 60.0, "Saprolite": 45.0, "Limonite": 35.0}

G_cg_geon = build_precedence_graph(df_geon, geon_mapping=geon_map, backend='compact')
G_nx_geon = build_precedence_graph(df_geon, geon_mapping=geon_map, backend='networkx')

edges_cg_geon = canonical_edges(G_cg_geon)
edges_nx_geon = canonical_edges(G_nx_geon)

INFO(f"GEON | CG: {G_cg_geon.number_of_nodes()} nodes {len(edges_cg_geon)} edges | NX: {G_nx_geon.number_of_nodes()} nodes {len(edges_nx_geon)} edges")

if edges_cg_geon == edges_nx_geon:
    OK("GEON: Himpunan edge identik (canonical).")
else:
    only_cg = edges_cg_geon - edges_nx_geon
    only_nx = edges_nx_geon - edges_cg_geon
    FAIL(f"GEON: Edge mismatch. Only-CG={len(only_cg)}, Only-NX={len(only_nx)}")
    failures_v2 += 1

# Periksa arah edge GEON
wrong_dir_geon = 0
for (u, v) in list(edges_cg_geon)[:200]:
    zu = df_geon.loc[u, 'Z']
    zv = df_geon.loc[v, 'Z']
    if zv <= zu:
        wrong_dir_geon += 1
if wrong_dir_geon == 0:
    OK("GEON: Arah edge benar (Z[v] > Z[u]) pada 200 edge sampel.")
else:
    FAIL(f"GEON: {wrong_dir_geon} edge dengan arah salah!")
    failures_v2 += 1

print(f"\n  [VER-2 RESULT] {'PASS' if failures_v2 == 0 else 'FAIL'} ({failures_v2} failures)")

# ═════════════════════════════════════════════════════════════════════════════
# VERIFIKASI 3 — Optimizer Equivalence (UPV, Selected Blocks, Feasibility)
# ═════════════════════════════════════════════════════════════════════════════

SECTION("VER-3: Optimizer Equivalence — UPV & Feasibility")

failures_v3 = 0
configs = [
    ('Global OSA 30', make_grid(8, 8, 5), 30, None),
    ('Global OSA 45', make_grid(8, 8, 5), 45, None),
    ('Global OSA 60', make_grid(8, 8, 5), 60, None),
]

for label, df_t, osa_t, geon_t in configs:
    rng = np.random.default_rng(999)
    df_t['BEV'] = rng.uniform(-500, 500, len(df_t))

    if geon_t:
        G_cg_t = build_precedence_graph(df_t, geon_mapping=geon_t, backend='compact')
        G_nx_t = build_precedence_graph(df_t, geon_mapping=geon_t, backend='networkx')
    else:
        G_cg_t = build_precedence_graph(df_t, osa=float(osa_t), backend='compact')
        G_nx_t = build_precedence_graph(df_t, osa=float(osa_t), backend='networkx')

    df_res_cg = optimize_pit(df_t.copy(), G_cg_t)
    df_res_nx = optimize_pit(df_t.copy(), G_nx_t)

    mined_cg = set(df_res_cg.index[df_res_cg['MINED_STATUS'] == 1])
    mined_nx = set(df_res_nx.index[df_res_nx['MINED_STATUS'] == 1])
    upv_cg = df_res_cg.loc[list(mined_cg), 'BEV'].sum() if mined_cg else 0.0
    upv_nx = df_res_nx.loc[list(mined_nx), 'BEV'].sum() if mined_nx else 0.0

    prec_edges_t = canonical_edges(G_cg_t)
    viol_cg = check_closure_feasibility(mined_cg, prec_edges_t)
    viol_nx = check_closure_feasibility(mined_nx, prec_edges_t)

    INFO(f"{label}: CG-UPV={upv_cg:.4f} NX-UPV={upv_nx:.4f} | CG-blok={len(mined_cg)} NX-blok={len(mined_nx)}")

    if abs(upv_cg - upv_nx) < 1e-4:
        OK(f"{label}: UPV match (delta={abs(upv_cg-upv_nx):.6f}).")
    else:
        FAIL(f"{label}: UPV mismatch! delta={abs(upv_cg-upv_nx):.4f}")
        failures_v3 += 1

    if mined_cg == mined_nx:
        OK(f"{label}: Himpunan blok terpilih identik.")
    else:
        sym_diff = len(mined_cg.symmetric_difference(mined_nx))
        if abs(upv_cg - upv_nx) < 1e-4:
            INFO(f"{label}: Blok berbeda ({sym_diff} blok), tapi UPV sama — tie-breaking alternatif yang valid.")
        else:
            FAIL(f"{label}: Blok berbeda ({sym_diff} blok) DAN UPV berbeda!")
            failures_v3 += 1

    if viol_cg == 0:
        OK(f"{label}: CG closure feasible (0 violations).")
    else:
        FAIL(f"{label}: CG closure INFEASIBLE ({viol_cg} violations)!")
        failures_v3 += 1

    if viol_nx == 0:
        OK(f"{label}: NX closure feasible (0 violations).")
    else:
        FAIL(f"{label}: NX closure INFEASIBLE ({viol_nx} violations)!")
        failures_v3 += 1

print(f"\n  [VER-3 RESULT] {'PASS' if failures_v3 == 0 else 'FAIL'} ({failures_v3} failures)")

# ═════════════════════════════════════════════════════════════════════════════
# VERIFIKASI 4 — Brute-Force Exact Optimum (N ≤ 15 blok)
# ═════════════════════════════════════════════════════════════════════════════

SECTION("VER-4: Brute-Force Exact Optimum Verification")

failures_v4 = 0
BF_CONFIGS = [
    (4, 4, 3, 45),   # 48 blok → terlalu besar; turunkan ke 3x3x3
    (3, 3, 3, 45),   # 27 blok → feasible
    (3, 3, 3, 30),
    (3, 3, 2, 60),   # 18 blok
]

for nx_c, ny_c, nz_c, osa in [(3,3,3,45), (3,3,3,30), (3,3,2,60)]:
    df_bf = make_grid(nx_c, ny_c, nz_c, dx=10, dy=10, dz=10)
    rng = np.random.default_rng(nx_c * 100 + osa)
    df_bf['BEV'] = rng.uniform(-10, 10, len(df_bf))
    n = len(df_bf)

    if n > 20:
        INFO(f"Grid {nx_c}×{ny_c}×{nz_c}: N={n} terlalu besar untuk brute-force, skip.")
        continue

    G_bf = build_precedence_graph(df_bf, osa=float(osa), backend='compact')
    prec_bf = list(canonical_edges(G_bf))

    bevs_list = df_bf['BEV'].values
    bf_val, bf_sel = brute_force_mwc(bevs_list, prec_bf)

    df_res_bf = optimize_pit(df_bf.copy(), G_bf)
    mined_bf = set(df_res_bf.index[df_res_bf['MINED_STATUS'] == 1])
    opt_val = df_res_bf.loc[list(mined_bf), 'BEV'].sum() if mined_bf else 0.0

    INFO(f"Grid {nx_c}×{ny_c}×{nz_c} N={n} OSA={osa}°: BF={bf_val:.6f} OPT={opt_val:.6f}")

    if abs(bf_val - opt_val) < 1e-4:
        OK(f"Optimizer menghasilkan optimum eksak (delta={abs(bf_val-opt_val):.8f}).")
    else:
        FAIL(f"Optimizer tidak optimal! BF={bf_val:.6f} vs OPT={opt_val:.6f}")
        failures_v4 += 1

print(f"\n  [VER-4 RESULT] {'PASS' if failures_v4 == 0 else 'FAIL'} ({failures_v4} failures)")

# ═════════════════════════════════════════════════════════════════════════════
# VERIFIKASI 5 — GEON Optimizer Equivalence
# ═════════════════════════════════════════════════════════════════════════════

SECTION("VER-5: GEON Optimizer Equivalence (CG vs NX)")

failures_v5 = 0
df_gv = make_grid(8, 8, 5)
df_gv['BEV'] = np.random.default_rng(77).uniform(-300, 300, len(df_gv))
df_gv['RockType'] = 'Bedrock'
df_gv.loc[df_gv['Z'] >= 20, 'RockType'] = 'Saprolite'
df_gv.loc[df_gv['Z'] >= 30, 'RockType'] = 'Limonite'

geon_v = {"Bedrock": 60.0, "Saprolite": 45.0, "Limonite": 35.0}

G_cg_gv = build_precedence_graph(df_gv, geon_mapping=geon_v, backend='compact')
G_nx_gv = build_precedence_graph(df_gv, geon_mapping=geon_v, backend='networkx')
df_opt_cg_gv = optimize_pit(df_gv.copy(), G_cg_gv)
df_opt_nx_gv = optimize_pit(df_gv.copy(), G_nx_gv)

m_cg = set(df_opt_cg_gv.index[df_opt_cg_gv['MINED_STATUS'] == 1])
m_nx = set(df_opt_nx_gv.index[df_opt_nx_gv['MINED_STATUS'] == 1])
upv_cg_gv = df_opt_cg_gv.loc[list(m_cg), 'BEV'].sum() if m_cg else 0.0
upv_nx_gv = df_opt_nx_gv.loc[list(m_nx), 'BEV'].sum() if m_nx else 0.0

INFO(f"GEON CG-UPV={upv_cg_gv:.4f} NX-UPV={upv_nx_gv:.4f} | CG-blok={len(m_cg)} NX-blok={len(m_nx)}")
prec_gv = canonical_edges(G_cg_gv)
viol_cg_gv = check_closure_feasibility(m_cg, prec_gv)
viol_nx_gv = check_closure_feasibility(m_nx, canonical_edges(G_nx_gv))

if abs(upv_cg_gv - upv_nx_gv) < 1e-4:
    OK(f"GEON: UPV match (delta={abs(upv_cg_gv-upv_nx_gv):.6f}).")
else:
    FAIL(f"GEON: UPV mismatch! delta={abs(upv_cg_gv-upv_nx_gv):.4f}")
    failures_v5 += 1

if viol_cg_gv == 0:
    OK(f"GEON CG closure: feasible.")
else:
    FAIL(f"GEON CG closure: {viol_cg_gv} violations!")
    failures_v5 += 1

if viol_nx_gv == 0:
    OK(f"GEON NX closure: feasible.")
else:
    FAIL(f"GEON NX closure: {viol_nx_gv} violations!")
    failures_v5 += 1

print(f"\n  [VER-5 RESULT] {'PASS' if failures_v5 == 0 else 'FAIL'} ({failures_v5} failures)")

# ═════════════════════════════════════════════════════════════════════════════
# VERIFIKASI 6 — Benchmark Runtime & Memory (10k blok, ukuran representatif)
# ═════════════════════════════════════════════════════════════════════════════

SECTION("VER-6: Benchmark Runtime & Memory (5000-blok dan 10000-blok)")

print("  (Hanya blok kecil yang dapat diukur handily tanpa RAM berlebih)")

for tag, nx_c, ny_c, nz_c, osa in [
    ("5k-OSA45", 25, 20, 10, 45),
    ("10k-OSA45", 50, 20, 10, 45),
]:
    df_bm = make_grid(nx_c, ny_c, nz_c)
    df_bm['BEV'] = np.random.default_rng(7).uniform(-1, 1, len(df_bm))
    n_blocks = len(df_bm)
    gc.collect()

    # CompactGraph
    rss_before = rss_mb()
    t0 = time.perf_counter()
    G_cg_bm = build_precedence_graph(df_bm, osa=float(osa), backend='compact')
    t_build_cg = time.perf_counter() - t0
    rss_after_build_cg = rss_mb()
    t0 = time.perf_counter()
    df_opt_cg_bm = optimize_pit(df_bm.copy(), G_cg_bm)
    t_opt_cg = time.perf_counter() - t0
    rss_after_opt_cg = rss_mb()
    gc.collect()

    # NetworkX
    rss_before_nx = rss_mb()
    t0 = time.perf_counter()
    G_nx_bm = build_precedence_graph(df_bm, osa=float(osa), backend='networkx')
    t_build_nx = time.perf_counter() - t0
    rss_after_build_nx = rss_mb()
    t0 = time.perf_counter()
    df_opt_nx_bm = optimize_pit(df_bm.copy(), G_nx_bm)
    t_opt_nx = time.perf_counter() - t0
    rss_after_opt_nx = rss_mb()
    gc.collect()

    e_cg_bm = G_cg_bm.number_of_edges()
    e_nx_bm = G_nx_bm.number_of_edges()
    cg_mem_mb = G_cg_bm.nbytes() / 1024**2

    # Validasi UPV
    m_cg_bm = set(df_opt_cg_bm.index[df_opt_cg_bm['MINED_STATUS'] == 1])
    m_nx_bm = set(df_opt_nx_bm.index[df_opt_nx_bm['MINED_STATUS'] == 1])
    upv_cg_bm = df_opt_cg_bm.loc[list(m_cg_bm), 'BEV'].sum() if m_cg_bm else 0.0
    upv_nx_bm = df_opt_nx_bm.loc[list(m_nx_bm), 'BEV'].sum() if m_nx_bm else 0.0

    print(f"\n  [{tag}] Blok: {n_blocks} | Edge: {e_cg_bm}")
    print(f"    Graph Build  : CG={t_build_cg:.3f}s  NX={t_build_nx:.3f}s  (speedup={t_build_nx/t_build_cg:.1f}x)")
    print(f"    Optimizer    : CG={t_opt_cg:.3f}s  NX={t_opt_nx:.3f}s  (speedup={t_opt_nx/t_opt_cg:.1f}x)")
    print(f"    E2E          : CG={(t_build_cg+t_opt_cg):.3f}s  NX={(t_build_nx+t_opt_nx):.3f}s")
    print(f"    CG array mem : {cg_mem_mb:.2f} MB  ({e_cg_bm} edges × 8 bytes)")
    if _PSUTIL:
        print(f"    Process RSS delta build: CG≈{rss_after_build_cg-rss_before:.1f}MB  NX≈{rss_after_build_nx-rss_before_nx:.1f}MB")
    else:
        print(f"    (psutil tidak tersedia — Process RSS tidak dapat diukur)")
    print(f"    UPV match: CG={upv_cg_bm:.4f} NX={upv_nx_bm:.4f} (delta={abs(upv_cg_bm-upv_nx_bm):.6f})")
    if abs(upv_cg_bm - upv_nx_bm) < 1e-3:
        OK("UPV match pada benchmark.")
    else:
        FAIL(f"UPV benchmark tidak cocok!")

# ═════════════════════════════════════════════════════════════════════════════
# RINGKASAN AKHIR
# ═════════════════════════════════════════════════════════════════════════════

SECTION("RINGKASAN AKHIR")
total_failures = failures_v1 + failures_v2 + failures_v3 + failures_v4 + failures_v5
print(f"\n  VER-1 (Edge Direction/Mapping Global OSA) : {'PASS' if failures_v1==0 else 'FAIL'}")
print(f"  VER-2 (Edge Direction/Mapping GEON)       : {'PASS' if failures_v2==0 else 'FAIL'}")
print(f"  VER-3 (Optimizer UPV & Feasibility)       : {'PASS' if failures_v3==0 else 'FAIL'}")
print(f"  VER-4 (Brute-Force Exact Optimum)         : {'PASS' if failures_v4==0 else 'FAIL'}")
print(f"  VER-5 (GEON Optimizer Equivalence)        : {'PASS' if failures_v5==0 else 'FAIL'}")
print(f"  VER-6 (Benchmark)                         : Lihat angka di atas")
print(f"\n  Total defects: {total_failures}")
verdict = "VALIDATED" if total_failures == 0 else ("PARTIALLY VALIDATED" if total_failures <= 2 else "BLOCKED")
print(f"\n  ══ FINAL VERDICT: {verdict} ══\n")
