/**
 * exportCSV.ts — EBM Engine CSV Block Export
 * Nama kolom data IDENTIK dengan nama yang dibaca backend (X, Y, Z, Grade, dst.)
 * agar file hasil ekspor bisa diimpor ulang tanpa error.
 * Satuan hanya dicantumkan di baris komentar # di bagian header.
 */

import { FinancialParams } from '../store/ebmStore';

function gUnitLabel(u?: string): string {
  switch (u) {
    case 'fraction': return 'fraksi';
    case 'percent':  return '%';
    case 'ppm':      return 'ppm';
    default:         return 'g/t';
  }
}

function pUnitLabel(u?: string, cur = 'IDR'): string {
  switch (u) {
    case 'per_kg':      return `${cur}/kg`;
    case 'per_troy_oz': return `${cur}/oz`;
    case 'per_t_metal': return `${cur}/t logam`;
    default:            return `${cur}/gram`;
  }
}

function fmtID(n: number, decimals = 4): string {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(n);
}

export default function exportCSV(
  pitBlocks: any[],
  financialParams: FinancialParams,
  csvFileName = '(tidak diketahui)',
  appVersion = '2.0.0',
) {
  const mined = pitBlocks.filter((b: any) => b.MINED_STATUS === 1);
  if (mined.length === 0) {
    alert('Tidak ada blok tergali untuk diekspor.');
    return;
  }

  const cur   = financialParams.currency || 'IDR';
  const gUnit = gUnitLabel(financialParams.grade_unit);
  const pUnit = pUnitLabel(financialParams.price_unit, cur);

  // ─── metadata header (baris # di-skip oleh parser CSV standar) ─────────────
  const meta: string[] = [
    `# EBM Engine v${appVersion} — Ekspor Blok Tergali`,
    `# Tanggal: ${new Date().toLocaleString('id-ID')}`,
    `# Berkas Data Masukan: ${csvFileName}`,
    `# ---`,
    `# PARAMETER FINANSIAL`,
    `# Satuan Kadar: ${gUnit}`,
    `# Satuan Harga: ${pUnit}`,
    `# Mata Uang: ${cur}`,
    `# Harga Komoditas: ${fmtID(financialParams.commodity_price)} ${pUnit}`,
    `# Biaya Tambang Ore: ${fmtID(financialParams.ore_mining_cost)} ${cur}/t`,
    `# Biaya Tambang Waste: ${fmtID(financialParams.waste_mining_cost)} ${cur}/t`,
    `# Biaya Pengolahan: ${fmtID(financialParams.processing_cost)} ${cur}/t`,
    `# Biaya Penjualan: ${fmtID(financialParams.selling_cost)} ${cur}/t`,
    `# Recovery Metalurgi: ${fmtID(financialParams.metallurgical_recovery * 100, 2)}%`,
    `# Cut-off Grade: ${fmtID(financialParams.cut_off_grade, 6)} ${gUnit}`,
    `# Overall Slope Angle (OSA): ${financialParams.osa}°`,
    `# ---`,
    `# CATATAN: Nilai tidak didiskon. Blok waste bernilai negatif (BEV) karena biaya penggalian untuk mengakses bijih.`,
    `# Jumlah blok tergali: ${mined.length}`,
    `# Total blok dalam model: ${pitBlocks.length}`,
    `# ---`,
    `# SATUAN KOLOM DATA`,
    `# X, Y = koordinat UTM [m]; Z = elevasi [m]`,
    `# Local_X, Local_Y = koordinat lokal relatif terhadap sudut minimum model [m]`,
    `# DX, DY, DZ = ukuran blok [m]`,
    `# Grade = kadar [${gUnit}]`,
    `# Density = densitas batu [t/m3]`,
    `# BEV = Block Economic Value [${cur}]; negatif untuk blok waste`,
    `# ---`,
  ];

  // ─── Nama kolom IDENTIK dengan nama yang dikenali backend ─────────────────
  // JANGAN tambah sufiks satuan di sini — akan gagal saat diimpor ulang.
  const COLS: string[] = [
    'X', 'Y', 'Z',
    'Local_X', 'Local_Y',
    'DX', 'DY', 'DZ',
    'Grade', 'Density',
    'RockType', 'Model_Type', 'Destination',
    'BEV', 'MINED_STATUS', 'Pushback_Phase',
  ];

  const headerRow = COLS.join(',');
  const dataRows = mined.map((b: any) =>
    COLS.map(key => {
      const v = b[key];
      if (v === undefined || v === null) return '';
      if (typeof v === 'number') return String(v); // angka mentah tanpa locale agar bisa diimpor
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csv = [...meta, headerRow, ...dataRows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `ebm_blok_tergali_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
