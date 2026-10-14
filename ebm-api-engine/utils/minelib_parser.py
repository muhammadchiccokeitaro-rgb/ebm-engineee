"""
utils/minelib_parser.py
Parser untuk dataset MineLib newman1.

Format newman1.blocks (TANPA header, dipisah spasi, 11 kolom):
  id x y z type grade tonns min_caf value_extracc value_proc apriori_process

Catatan:
- 	ype adalah string kode (FRWS, FROR, OXOR, ...), bukan integer
- Blok tipe tertentu punya value_proc ~ -5e19 (tidak bisa diproses)
- Nilai harus di-clip sebelum diskalakan ke int untuk hindari overflow

Format newman1.prec (11 kolom per baris):
  block_id  n_predecessors  pred_1  pred_2  ...
  (jika n_predecessors=0: hanya "block_id 0")
"""
from __future__ import annotations
import pandas as pd
import numpy as np
from pathlib import Path

# Clip nilai ekstrem sebelum skala untuk hindari overflow
_CLIP_MIN = -1e15
_CLIP_MAX =  1e15


def parse_blocks(filepath: str | Path) -> pd.DataFrame:
    """
    Baca newman1.blocks -> DataFrame dengan kolom standar.
    Kolom: id, x, y, z, type, grade, tonns, min_caf, value_extracc, value_proc, apriori_process
    """
    col_names = [
        "id", "x", "y", "z", "type", "grade", "tonns", "min_caf",
        "value_extracc", "value_proc", "apriori_process",
    ]
    df = pd.read_csv(
        filepath,
        sep=r"\s+",
        header=None,
        names=col_names,
        dtype={
            "id": int,
            "x": float, "y": float, "z": float,
            "type": str,          # string kode seperti FRWS, FROR, OXOR
            "grade": float, "tonns": float, "min_caf": float,
            "value_extracc": float, "value_proc": float,
            "apriori_process": float,
        },
    )

    assert len(df) == 1060, f"Ekspektasi 1060 blok, dapat {len(df)}"
    assert df["id"].min() == 0 and df["id"].max() == 1059, "ID blok harus 0..1059"
    assert df["id"].nunique() == 1060, "ID blok harus unik"

    return df.reset_index(drop=True)


def block_values(
    df: pd.DataFrame,
    scaling_factor: int = 1000,
) -> tuple[dict[int, int], dict[int, float]]:
    """
    Nilai blok = max(value_extracc, value_proc).

    Nilai ekstrem seperti -5e19 (blok yang tidak bisa diproses) di-clip
    ke [-1e15, 1e15] sebelum diskalakan agar tidak overflow int64/int32.

    Returns
    -------
    scaled   : {block_id -> int}   -- nilai terskala & dibulatkan (dari clipped)
    original : {block_id -> float} -- nilai float ASLI max() (untuk UPV)
    """
    ve = df["value_extracc"].values
    vp = df["value_proc"].values

    # Nilai asli untuk hitung UPV (setelah max, tanpa clip)
    original_max = np.maximum(ve, vp)

    # Clip sebelum skala untuk hindari overflow
    ve_clipped = np.clip(ve, _CLIP_MIN, _CLIP_MAX)
    vp_clipped = np.clip(vp, _CLIP_MIN, _CLIP_MAX)
    clipped_max = np.maximum(ve_clipped, vp_clipped)

    ids = df["id"].values
    scaled:   dict[int, int]   = {}
    original: dict[int, float] = {}

    for i in range(len(df)):
        bid = int(ids[i])
        scaled[bid]   = int(round(float(clipped_max[i]) * scaling_factor))
        original[bid] = float(original_max[i])

    return scaled, original


def parse_precedence(filepath: str | Path) -> list[tuple[int, int]]:
    """
    Baca newman1.prec -> list of (block_id, predecessor_id).

    Semantik: untuk menggali block_id, semua predecessor_id harus digali dulu.
    Arah sisi dalam graf: block_id -> predecessor_id (kapasitas INF).
    """
    edges: list[tuple[int, int]] = []

    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = list(map(int, line.split()))
            block_id = parts[0]
            n_prec   = parts[1]
            predecessors = parts[2:]

            assert len(predecessors) == n_prec, (
                f"Blok {block_id}: deklarasi {n_prec} pendahulu, "
                f"tapi ada {len(predecessors)} entri"
            )

            for pred in predecessors:
                assert pred != block_id, f"Self-loop pada blok {block_id}"
                edges.append((block_id, pred))

    # Validasi
    all_ids = {u for u, v in edges} | {v for u, v in edges}
    assert all_ids <= set(range(1060)), \
        f"ID di luar rentang 0..1059: {all_ids - set(range(1060))}"
    assert len(edges) == 3922, \
        f"Ekspektasi 3922 sisi precedence, dapat {len(edges)}"

    return edges


def parse_upit(filepath: str | Path) -> dict[int, float]:
    """
    Baca file .upit MineLib (format UPIT) -> dict {block_id: value (float)}.
    Baris header diabaikan hingga 'OBJECTIVE_FUNCTION:', membaca 'id value' hingga 'EOF'.
    """
    values: dict[int, float] = {}
    in_objective = False
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line == "EOF":
                continue
            if line.startswith("OBJECTIVE_FUNCTION"):
                in_objective = True
                continue
            if in_objective:
                parts = line.split()
                if len(parts) >= 2:
                    values[int(parts[0])] = float(parts[1])
    return values


def parse_precedence_general(filepath: str | Path) -> list[tuple[int, int]]:
    """
    Baca file .prec MineLib umum -> list of (block_id, predecessor_id).
    Mendukung sembarang jumlah blok tanpa batas spesifik 1060 blok.
    """
    edges: list[tuple[int, int]] = []
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = [int(x) for x in line.split()]
            block_id = parts[0]
            n_prec = parts[1]
            predecessors = parts[2:]
            assert len(predecessors) == n_prec, (
                f"Blok {block_id}: deklarasi {n_prec} pendahulu, dapat {len(predecessors)}"
            )
            for pred in predecessors:
                assert pred != block_id, f"Self-loop pada blok {block_id}"
                edges.append((block_id, pred))
    return edges
