"""
tests/test_minelib_marvin.py
Validasi inti optimizer EBM (pit_optimizer.py) menggunakan dataset benchmark MineLib Marvin.

Format marvin.upit: nilai blok resmi (53.271 blok).
Format marvin.prec: graf precedence resmi (650.631 relasi).

Referensi resmi MineLib Marvin UPIT: 1.415.655.436
"""

from __future__ import annotations
import sys
import os
import time
import pytest
import numpy as np
import pandas as pd
import networkx as nx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from utils.minelib_parser import parse_upit, parse_precedence_general
from core.pit_optimizer import optimize_pit

FIXTURES_DIR = os.path.join(ROOT, "tests", "fixtures")
UPIT_FILE = os.path.join(FIXTURES_DIR, "marvin.upit")
PREC_FILE = os.path.join(FIXTURES_DIR, "marvin.prec")

# Jika belum di tests/fixtures, periksa fallback ke folder marvin.files dan marvin.prec
if not os.path.exists(UPIT_FILE):
    ALT_UPIT = os.path.join(ROOT, "marvin.files", "marvin.upit")
    if os.path.exists(ALT_UPIT):
        UPIT_FILE = ALT_UPIT

if not os.path.exists(PREC_FILE):
    ALT_PREC = os.path.join(ROOT, "marvin.prec", "marvin.prec")
    if os.path.exists(ALT_PREC):
        PREC_FILE = ALT_PREC

MARVIN_OFFICIAL_OPTIMAL = 1_415_655_436.0
TOLERANCE = 1.0


@pytest.mark.slow
def test_minelib_marvin():
    if not os.path.exists(UPIT_FILE) or not os.path.exists(PREC_FILE):
        pytest.skip(f"Fixture Marvin tidak ditemukan: UPIT={UPIT_FILE}, PREC={PREC_FILE}")

    print("\n" + "=" * 78)
    print("  VALIDASI INTI OPTIMIZER (pit_optimizer.py) — MineLib Marvin")
    print("=" * 78)

    # 1. Parsing
    t0 = time.time()
    vals_dict = parse_upit(UPIT_FILE)
    t1 = time.time()
    time_parse_upit = t1 - t0

    t2 = time.time()
    edges = parse_precedence_general(PREC_FILE)
    t3 = time.time()
    time_parse_prec = t3 - t2
    total_parse_time = time_parse_upit + time_parse_prec

    num_blocks = len(vals_dict)
    print(f"  [Parse] Blok: {num_blocks:,} ({time_parse_upit:.2f}s) | Precedence: {len(edges):,} ({time_parse_prec:.2f}s)")

    # 2. Bangun DataFrame dan Graf
    t_mat0 = time.time()
    bev_array = np.array([vals_dict[i] for i in range(num_blocks)], dtype=np.float64)
    df_opt = pd.DataFrame({"BEV": bev_array})
    G_prec = nx.DiGraph()
    G_prec.add_nodes_from(range(num_blocks))
    G_prec.add_edges_from(edges)
    t_mat1 = time.time()
    time_build_matrix_graph = t_mat1 - t_mat0
    print(f"  [Bangun Matriks/Graf] Waktu: {time_build_matrix_graph:.2f}s (Nodes: {G_prec.number_of_nodes()}, Edges: {G_prec.number_of_edges()})")

    # 3. Jalankan pit_optimizer dengan auto-scaling aktif
    t_opt0 = time.time()
    df_result, meta = optimize_pit(df_opt, G_prec, return_meta=True)
    t_opt1 = time.time()
    time_max_flow = t_opt1 - t_opt0
    print(f"  [Max-Flow / Min-Cut] Waktu: {time_max_flow:.2f}s")

    # 4. Evaluasi Hasil
    mined_mask = df_result["MINED_STATUS"].values == 1
    mined_indices = np.where(mined_mask)[0]
    n_mined = len(mined_indices)

    # Hitung UPV dari nilai float asli blok yang MINED_STATUS == 1
    upv = float(bev_array[mined_mask].sum())
    diff = abs(upv - MARVIN_OFFICIAL_OPTIMAL)

    # Cek closure: semua pendahulu blok tergali wajib ikut tergali
    mined_set = set(mined_indices.tolist())
    violations = [(u, v) for u, v in edges if u in mined_set and v not in mined_set]
    closure_sah = (len(violations) == 0)

    # 5. Cetak Metrik Lengkap
    print("  " + "-" * 78)
    print(f"  UPV Terhitung          : {upv:,.2f}")
    print(f"  Referensi Resmi MineLib : {MARVIN_OFFICIAL_OPTIMAL:,.2f}")
    print(f"  Selisih (Delta)        : {diff:.6f}")
    print(f"  Jumlah Blok Tergali    : {n_mined:,} blok (harapan sekitar 8.516)")
    print(f"  Status Closure         : {'SAH (0 pelanggaran)' if closure_sah else f'GAGAL ({len(violations)} pelanggaran)'}")
    print(f"  Skala yang Dipakai     : {meta.get('effective_scale', 'N/A')} (AutoScale={meta.get('autoscale_triggered')}, PosSum={meta.get('pos_sum_after_scale')})")
    print(f"  Rincian Waktu          : Parse={total_parse_time:.2f}s | Bangun Matriks={time_build_matrix_graph:.2f}s | Max-Flow={time_max_flow:.2f}s")
    print("  " + "-" * 78)

    # 6. Assertions
    assert closure_sah, f"Closure gagal: {len(violations)} presedensi terlanggar!"
    assert diff <= TOLERANCE, f"Selisih UPV ({diff:.6f}) melebihi toleransi ({TOLERANCE})!"
    print("  HASIL: VALIDASI MINELIB MARVIN LULUS 100%!")


if __name__ == "__main__":
    test_minelib_marvin()
