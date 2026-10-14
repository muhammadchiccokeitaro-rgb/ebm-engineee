"""
tests/test_minelib_validation.py
Validasi inti optimizer EBM menggunakan dataset benchmark MineLib newman1.

CAKUPAN:
  Memvalidasi pit_optimizer.py (max-weight closure via SciPy maximum_flow)
  pada graf precedence yang disediakan langsung oleh MineLib.
  TIDAK mencakup core/graph_builder.py (pembentukan precedence via KDTree/OSA).

Dapat dijalankan dengan:
  ="utf-8"
  python tests/test_minelib_validation.py
  pytest tests/test_minelib_validation.py -v -s
"""
from __future__ import annotations
import sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import numpy as np
import pandas as pd
import networkx as nx

from utils.minelib_parser import parse_blocks, block_values, parse_precedence
from core.pit_optimizer import optimize_pit

# ─── Lokasi data ──────────────────────────────────────────────────────────────
DATA_DIR    = os.path.join(ROOT, "newman1_data")
BLOCKS_FILE = os.path.join(DATA_DIR, "newman1.blocks")
PREC_FILE   = os.path.join(DATA_DIR, "newman1.prec")
if not os.path.exists(BLOCKS_FILE):
    BLOCKS_FILE = os.path.join(ROOT, "newman1.blocks")
    PREC_FILE   = os.path.join(ROOT, "newman1.prec")

# Toleransi pre-registered sebelum pengujian dilakukan
MINELIB_OPTIMAL = 26_086_899.0
TOLERANCE = 1.0


# ─── Helper: build nx.DiGraph dari edges prec ─────────────────────────────────
def build_nx_graph(edges: list[tuple[int, int]]) -> nx.DiGraph:
    G = nx.DiGraph()
    G.add_nodes_from(range(1060))
    G.add_edges_from(edges)
    return G


# ─── Helper: bangun graf untuk referensi NetworkX min-cut ─────────────────────
def build_nx_closure_graph(
    scaled: dict[int, int],
    edges: list[tuple[int, int]],
    INF_CAP: int = 2_000_000_000,
) -> tuple[nx.DiGraph, int, int]:
    n = 1060
    source, sink = n, n + 1
    G = nx.DiGraph()
    G.add_nodes_from(range(n + 2))
    for bid, val in scaled.items():
        if val > 0:
            G.add_edge(source, bid, capacity=val)
        elif val < 0:
            G.add_edge(bid, sink, capacity=-val)
    for (u, v) in edges:
        G.add_edge(u, v, capacity=INF_CAP)
    return G, source, sink


# ─── Satu siklus validasi dengan return_meta ──────────────────────────────────
def run_one(scaling_factor: int, df_blocks, edges) -> tuple[float, int, np.ndarray, dict]:
    scaled, original = block_values(df_blocks, scaling_factor=scaling_factor)
    bev_values = np.array([scaled[i] for i in range(1060)], dtype=np.float64)
    df_opt = pd.DataFrame({"BEV": bev_values, "id_block": np.arange(1060)})
    G_prec = build_nx_graph(edges)

    df_result, meta = optimize_pit(df_opt, G_prec, return_meta=True)
    meta["requested_scale"] = scaling_factor

    mined_mask = df_result["MINED_STATUS"].values == 1
    upv = sum(original[i] for i in range(1060) if mined_mask[i])
    n_mined = int(mined_mask.sum())
    return upv, n_mined, mined_mask, meta


def check_closure(mined_mask: np.ndarray, edges: list[tuple[int, int]]) -> bool:
    violations = [(b, p) for b, p in edges if mined_mask[b] and not mined_mask[p]]
    if violations:
        print(f"  [CLOSURE] GAGAL: {len(violations)} violation. Contoh: {violations[:5]}")
        return False
    return True


# ─── Diagnosis selisih ────────────────────────────────────────────────────────
def diagnose_delta(mined_mask: np.ndarray, original: dict[int, float]):
    """
    Cetak breakdown selisih 0.026 dengan presisi penuh.
    """
    selected_vals = [original[i] for i in range(1060) if mined_mask[i]]
    upv_raw   = sum(selected_vals)
    upv_int   = sum(round(v) for v in selected_vals)
    delta_raw = abs(upv_raw  - MINELIB_OPTIMAL)
    delta_int = abs(upv_int  - MINELIB_OPTIMAL)
    ref_is_int = (MINELIB_OPTIMAL == int(MINELIB_OPTIMAL))

    print()
    print("  DIAGNOSIS SELISIH 0.026")
    print("  " + "-" * 62)
    print(f"  (a) UPV sum float asli (6 desimal) : {upv_raw:.6f}")
    print(f"  (b) UPV setelah tiap blok dibulatkan: {upv_int:.6f}")
    print(f"  (c) Referensi MineLib               : {MINELIB_OPTIMAL:.6f}")
    print(f"  (d) Selisih (a) vs referensi        : {delta_raw:.6f}")
    print(f"  (e) Selisih (b) vs referensi        : {delta_int:.6f}")
    print(f"  (f) Referensi adalah bilangan bulat : {ref_is_int}")
    print()

    # Berapa nilai blok yang bukan bilangan bulat?
    n_frac = sum(1 for v in selected_vals if v != round(v))
    frac_sum = sum(v - round(v) for v in selected_vals)
    print(f"  Blok terpilih dengan nilai non-integer : {n_frac} / {len(selected_vals)}")
    print(f"  Total selisih fraksi kumulatif         : {frac_sum:.6f}")
    print()

    return {
        "upv_raw": upv_raw,
        "upv_int": upv_int,
        "delta_raw": delta_raw,
        "delta_int": delta_int,
        "ref_is_int": ref_is_int,
        "n_frac_blocks": n_frac,
        "cumulative_fraction": frac_sum,
    }


# ─── Fungsi utama test ─────────────────────────────────────────────────────────
def test_minelib_newman1():
    print("=" * 72)
    print("  VALIDASI INTI OPTIMIZER — MineLib newman1")
    print("  (Cakupan: pit_optimizer.py | TIDAK mencakup graph_builder.py)")
    print("=" * 72)

    df_blocks = parse_blocks(BLOCKS_FILE)
    edges = parse_precedence(PREC_FILE)

    # ── Tabel sensitivitas skala ─────────────────────────────────────────────
    # Catatan: toleransi pre-registered = 1.0 (ditetapkan sebelum test dijalankan)
    # Skala diuji: 1 (total positif mungkin < 1e9 -> auto-scale TIDAK terpicu),
    #              100, 1000 (total positif mungkin > 1e9 -> auto-scale MUNGKIN terpicu)

    SCALES = [1, 10, 100, 1000]
    header = (
        f"  {'Skala':>6}  {'AutoScale':>9}  {'Eff.Divisor':>13}"
        f"  {'PosSum(int)':>12}  {'UPV':>16}  {'Selisih':>9}  {'Status':>7}"
    )
    print()
    print(header)
    print("  " + "-" * 82)

    scale_results = {}
    effective_divisors_seen: dict[float, list[int]] = {}

    for sf in SCALES:
        upv, n_mined, mask, meta = run_one(sf, df_blocks, edges)
        diff = abs(upv - MINELIB_OPTIMAL)
        status = "OK" if diff <= TOLERANCE else "WARN"
        eff_div = meta["effective_divisor"]
        triggered = meta["autoscale_triggered"]

        print(
            f"  {sf:>6}  {'YES' if triggered else 'NO':>9}  {eff_div:>13.6f}"
            f"  {meta['pos_sum_after_scale']:>12}  {upv:>16.6f}  {diff:>9.4f}  {status:>7}"
        )
        scale_results[sf] = (upv, n_mined, mask, meta)

        key = round(eff_div, 6)
        effective_divisors_seen.setdefault(key, []).append(sf)

    print("  " + "-" * 82)

    # Deteksi baris dengan skala efektif identik
    identical_groups = {k: v for k, v in effective_divisors_seen.items() if len(v) > 1}
    if identical_groups:
        print()
        print("  CATATAN: Baris berikut memakai skala efektif yang sama persis —")
        print("  hasilnya IDENTIK secara deterministik, bukan bukti 'stabilitas presisi':")
        for div, sfs in identical_groups.items():
            print(f"    Divisor {div:.6f}  ->  skala diminta: {sfs}")

    # ── Detail validasi skala 1000 ──────────────────────────────────────────
    print()
    print("  " + "-" * 72)
    print("  Detail validasi (scaling_factor = 1000)")
    print("  " + "-" * 72)

    upv_1000, n_mined_1000, mask_1000, meta_1000 = scale_results[1000]
    _, original_1000 = block_values(df_blocks, scaling_factor=1000)

    print(f"  Blok digali        : {n_mined_1000} / 1060")
    print(f"  Total Optimal UPV  : {upv_1000:,.6f}")
    print(f"  Referensi MineLib  : {MINELIB_OPTIMAL:,.6f}")
    print(f"  Selisih            : {abs(upv_1000 - MINELIB_OPTIMAL):.6f}")
    print(f"  Toleransi (pre-reg): {TOLERANCE}")
    print(f"  AutoScale terpicu  : {meta_1000['autoscale_triggered']}")
    print(f"  Effective divisor  : {meta_1000['effective_divisor']:.6f}")
    print(f"  n_clipped          : {meta_1000['n_clipped']}")

    # ── Cek closure ─────────────────────────────────────────────────────────
    print()
    print("  Cek closure (skala 1000)...")
    closure_ok = check_closure(mask_1000, edges)
    if closure_ok:
        print("  [OK] Closure sah: semua pendahulu blok yang digali terpenuhi")

    # ── Diagnosis selisih 0.026 ──────────────────────────────────────────────
    diag = diagnose_delta(mask_1000, original_1000)

    # ── Referensi independen: NetworkX minimum_cut ───────────────────────────
    print("  Hitung referensi NetworkX minimum_cut (bisa lambat ~5 detik)...")
    scaled_1000, _ = block_values(df_blocks, scaling_factor=1000)
    G_nx, src, snk = build_nx_closure_graph(scaled_1000, edges)
    cut_value, (S, T) = nx.minimum_cut(G_nx, src, snk, capacity="capacity")
    nx_mined = S - {src}
    upv_nx = sum(original_1000[b] for b in nx_mined if b < 1060)
    diff_nx = abs(upv_1000 - upv_nx)
    print(f"  NetworkX UPV (float asli)  : {upv_nx:,.6f}")
    print(f"  Selisih SciPy vs NetworkX  : {diff_nx:.6f}")

    # ── Assertions ───────────────────────────────────────────────────────────
    print()
    print("  " + "-" * 72)
    print("  ASSERTION CHECK")
    print("  " + "-" * 72)

    passed = 0

    assert closure_ok, "GAGAL [1/3]: Closure violation"
    print("  [1/3] Closure sah                             [OK]")
    passed += 1

    assert diff_nx <= TOLERANCE, f"GAGAL [2/3]: SciPy vs NetworkX diff = {diff_nx:.6f} > {TOLERANCE}"
    print(f"  [2/3] SciPy == NetworkX (diff={diff_nx:.6f})      [OK]")
    passed += 1

    assert abs(upv_1000 - MINELIB_OPTIMAL) <= TOLERANCE, (
        f"GAGAL [3/3]: UPV={upv_1000:.6f}, ref={MINELIB_OPTIMAL}, "
        f"selisih={abs(upv_1000-MINELIB_OPTIMAL):.6f} > {TOLERANCE}"
    )
    print(f"  [3/3] UPV ~= MineLib ref (diff={abs(upv_1000-MINELIB_OPTIMAL):.6f} <= {TOLERANCE})  [OK]")
    passed += 1

    print()
    print("=" * 72)
    print(f"  HASIL: {passed}/3 assertion LULUS")
    print(f"  STATUS: {'LULUS' if passed == 3 else 'GAGAL'}")
    print("=" * 72)
    print()


if __name__ == "__main__":
    test_minelib_newman1()
