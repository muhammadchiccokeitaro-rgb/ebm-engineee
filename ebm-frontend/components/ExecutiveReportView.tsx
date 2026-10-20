'use client';

import React from 'react';
import { useEBMStore } from '../store/ebmStore';
import {
  FileText,
  Download,
  Box,
  Layers,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Info,
  Pickaxe,
  Compass,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import exportCSVLib from '../lib/exportCSV';
import PitSelectionTable from './PitSelectionTable';

export default function ExecutiveReportView() {
  const {
    summary,
    pitBlocks,
    financialParams,
    lithologyColors,
    pitSelection,
    pitSelectionError,
    isStale,
    utmZone,
    utmHemisphere,
    coordinateSystem,
    kmlMetadata,
    pitBoundaryPolygons,
    csvFile,
    setActiveTab,
  } = useEBMStore();

  const currLabel = financialParams.currency || 'IDR';
  const gradeLabel =
    financialParams.grade_unit === 'g_per_t'
      ? 'g/t'
      : financialParams.grade_unit === 'percent'
      ? '%'
      : financialParams.grade_unit || 'g/t';

  const fmtId = (v: number, decimals: number = 2) =>
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: decimals }).format(v);

  const fmtCur = (v: number) => `${currLabel} ${fmtId(v, 0)}`;

  // ── Derived Metrics (Optimized single-pass O(N) calculation) ──
  const {
    minedBlockCount,
    totalBlockCount,
    minedPercent,
    pitDepthStr,
    avgOreGradeStr,
    oreBlockCount,
    wasteBlockCount,
    blockSizeStr,
    lithologyBreakdown,
  } = React.useMemo(() => {
    const len = pitBlocks?.length || 0;
    if (len === 0) {
      return {
        minedBlockCount: 0,
        totalBlockCount: 0,
        minedPercent: 0,
        pitDepthStr: '-',
        avgOreGradeStr: '-',
        oreBlockCount: 0,
        wasteBlockCount: 0,
        blockSizeStr: '-',
        lithologyBreakdown: [],
      };
    }

    let minedCount = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let firstDZ = 10;
    let oreCount = 0;
    let wasteCount = 0;
    let oreTonnageSum = 0;
    let oreGradeWeightedSum = 0;

    const lithoMap: Record<
      string,
      {
        count: number;
        oreCount: number;
        wasteCount: number;
        oreTonnage: number;
        wasteTonnage: number;
        totalTonnage: number;
        gradeSum: number;
      }
    > = {};

    for (let i = 0; i < len; i++) {
      const b = pitBlocks[i];
      if (b.MINED_STATUS === 1) {
        minedCount++;
        if (b.Z < minZ) minZ = b.Z;
        if (b.Z > maxZ) maxZ = b.Z;
        if (b.DZ) firstDZ = b.DZ;

        const dx = b.DX || 10;
        const dy = b.DY || 10;
        const dz = b.DZ || 10;
        const density = b.Density || 2.7;
        const t = dx * dy * dz * density;
        const isOre = b.Destination === 'Ore' || b.Model_Type === 'Ore';

        if (isOre) {
          oreCount++;
          oreTonnageSum += t;
          oreGradeWeightedSum += (b.Grade || 0) * t;
        } else {
          wasteCount++;
        }

        const rock = b.RockType || 'Unassigned';
        let entry = lithoMap[rock];
        if (!entry) {
          entry = {
            count: 0,
            oreCount: 0,
            wasteCount: 0,
            oreTonnage: 0,
            wasteTonnage: 0,
            totalTonnage: 0,
            gradeSum: 0,
          };
          lithoMap[rock] = entry;
        }
        entry.count++;
        entry.totalTonnage += t;
        if (isOre) {
          entry.oreCount++;
          entry.oreTonnage += t;
          entry.gradeSum += (b.Grade || 0) * t;
        } else {
          entry.wasteCount++;
          entry.wasteTonnage += t;
        }
      }
    }

    const depth = minZ !== Infinity ? maxZ - minZ + firstDZ : 0;
    const depthStr = minZ !== Infinity ? `${fmtId(depth, 1)} m` : '-';
    const avgGrade = oreTonnageSum > 0 ? oreGradeWeightedSum / oreTonnageSum : 0;
    const avgGradeStr = oreTonnageSum > 0 ? `${fmtId(avgGrade, 3)} ${gradeLabel}` : '-';

    const totalMinedTon =
      (summary?.total_ore_tonnage || 0) + (summary?.total_waste_tonnage || 0) || oreTonnageSum || 1;
    const breakdown = Object.entries(lithoMap)
      .map(([rock, stats]) => ({
        rock,
        ...stats,
        avgGrade: stats.oreTonnage > 0 ? stats.gradeSum / stats.oreTonnage : 0,
        sharePercent: (stats.totalTonnage / totalMinedTon) * 100,
      }))
      .sort((a, b) => b.totalTonnage - a.totalTonnage);

    const firstB = pitBlocks[0];
    const bDX = firstB?.DX ?? '-';
    const bDY = firstB?.DY ?? '-';
    const bDZ = firstB?.DZ ?? '-';
    const bSizeStr = bDX === bDY && bDX === bDZ ? `${bDX} m (kubus)` : `${bDX}×${bDY}×${bDZ} m`;

    return {
      minedBlockCount: minedCount,
      totalBlockCount: len,
      minedPercent: len > 0 ? (minedCount / len) * 100 : 0,
      pitDepthStr: depthStr,
      avgOreGradeStr: avgGradeStr,
      oreBlockCount: oreCount,
      wasteBlockCount: wasteCount,
      blockSizeStr: bSizeStr,
      lithologyBreakdown: breakdown,
    };
  }, [pitBlocks, summary?.total_ore_tonnage, summary?.total_waste_tonnage, gradeLabel]);

  // ── EMPTY STATE (Jika belum ada hasil optimasi) ──
  if (!summary) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#070712] text-center">
        <div className="max-w-md bg-[#0e0e1a] border border-[#1e1e30] rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="w-14 h-14 rounded-xl bg-blue-950/50 border border-blue-700/40 flex items-center justify-center mx-auto text-blue-400">
            <FileText size={28} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-gray-100 tracking-tight">Belum Ada Hasil Optimasi Pit</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Laporan eksekutif dan analisis teknis komprehensif akan otomatis disusun setelah Anda menjalankan optimasi batas pit penambangan.
            </p>
          </div>
          <div className="bg-[#090914] border border-[#1d1d2e] rounded-xl p-4 text-left text-xs text-gray-300 space-y-2.5 font-mono">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Alur Kerja Cepat:</div>
            <div className="flex items-center gap-2.5 text-gray-300">
              <span className="w-5 h-5 rounded-full bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
              <span>Buka tab <strong>3D Workspace</strong></span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-300">
              <span className="w-5 h-5 rounded-full bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              <span>Muat berkas model blok (CSV)</span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-300">
              <span className="w-5 h-5 rounded-full bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
              <span>Jalankan <strong>Optimasi Batas Pit</strong></span>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('workspace')}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/20 transition-all cursor-pointer btn-tactile"
          >
            <Pickaxe size={15} /> Buka 3D Workspace
          </button>
        </div>
      </div>
    );
  }

  // ── FULL REPORT DASHBOARD ──
  return (
    <div className="flex-1 flex flex-col h-full bg-[#070712] text-gray-200 overflow-y-auto custom-scrollbar p-6 lg:p-8 space-y-6">
      {/* ── Top Header & Actions ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1c1c2c]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-950/50 text-blue-400 border border-blue-800/40 tracking-wider uppercase">
              Laporan Eksekutif
            </span>
            {isStale ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950/40 text-amber-400 border border-amber-800/40 flex items-center gap-1">
                <AlertTriangle size={10} /> Parameter Berubah (Belum Dioptimasi Ulang)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 flex items-center gap-1">
                <CheckCircle2 size={10} /> Optimasi Sinkron
              </span>
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-white mt-1.5 tracking-tight">
            Executive Report & Technical Analytics
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Evaluasi Teknis Batas Pit Ultimate, Neraca Massa Batuan, dan Penilaian Ekonomi Tambang
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const { default: exportPDF } = await import('../lib/exportPDF');
              exportPDF(summary, financialParams, pitBlocks, lithologyColors, pitSelection ?? undefined);
            }}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold rounded-md shadow-sm transition-all cursor-pointer btn-tactile active:scale-[0.98]"
          >
            <FileText size={14} /> Ekspor PDF
          </button>
          <button
            onClick={() => exportCSVLib(pitBlocks, financialParams, csvFile?.name)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-700/90 hover:bg-emerald-600 text-white text-xs font-semibold rounded-md shadow-sm transition-all cursor-pointer btn-tactile active:scale-[0.98]"
          >
            <Download size={14} /> Ekspor CSV
          </button>
          <button
            onClick={() => setActiveTab('workspace')}
            className="flex items-center gap-2 px-3 py-2 bg-[#141422] hover:bg-[#1a1a2e] text-gray-300 hover:text-white text-xs font-semibold rounded-md border border-[#26263a] transition-all cursor-pointer btn-tactile active:scale-[0.98]"
          >
            <Box size={14} /> Kembali ke 3D
          </button>
        </div>
      </div>

      {/* ── KPI Grid (4 Cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Undiscounted Value */}
        <div className="glass-card bg-[#0e0e1a]/90 border border-[#1e1e30] rounded-xl p-4 flex flex-col justify-between shadow-md hover:border-[#2a2a44] transition-all duration-200">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span className="font-medium text-[11px] text-gray-400 tracking-wide">Nilai Pit (Undiscounted)</span>
            <DollarSign size={16} className="text-emerald-400/90" />
          </div>
          <div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${
                (summary.total_undiscounted_value ?? summary.total_npv) >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {fmtCur(summary.total_undiscounted_value ?? summary.total_npv)}
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5 leading-normal">
              Akumulasi nilai ekonomi pit tanpa faktor diskonto waktu (RF 1,0).
            </p>
          </div>
        </div>

        {/* Card 2: Ore Mined */}
        <div className="glass-card bg-[#0e0e1a]/90 border border-[#1e1e30] rounded-xl p-4 flex flex-col justify-between shadow-md hover:border-[#2a2a44] transition-all duration-200">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span className="font-medium text-[11px] text-gray-400 tracking-wide">Total Bijih (Ore)</span>
            <TrendingUp size={16} className="text-amber-400/90" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono tabular-nums tracking-tight text-gray-100">
              {fmtId(summary.total_ore_tonnage)}{' '}
              <span className="text-xs font-normal text-gray-400 font-sans">ton</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-mono tabular-nums text-amber-300 bg-amber-950/40 border border-amber-800/30 px-1.5 py-0.5 rounded">
                Kadar: {avgOreGradeStr}
              </span>
              <span className="text-[10px] text-gray-500 font-mono tabular-nums">
                ({oreBlockCount.toLocaleString('id-ID')} blok)
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Waste Mined */}
        <div className="glass-card bg-[#0e0e1a]/90 border border-[#1e1e30] rounded-xl p-4 flex flex-col justify-between shadow-md hover:border-[#2a2a44] transition-all duration-200">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span className="font-medium text-[11px] text-gray-400 tracking-wide">Total Waste Mined</span>
            <Layers size={16} className="text-cyan-400/90" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono tabular-nums tracking-tight text-gray-100">
              {fmtId(summary.total_waste_tonnage)}{' '}
              <span className="text-xs font-normal text-gray-400 font-sans">ton</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-mono tabular-nums text-cyan-300 bg-cyan-950/40 border border-cyan-800/30 px-1.5 py-0.5 rounded">
                SR: {fmtId(summary.stripping_ratio, 2)}
              </span>
              <span className="text-[10px] text-gray-500 font-mono tabular-nums">
                ({wasteBlockCount.toLocaleString('id-ID')} blok)
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Pit Geometry & Depth */}
        <div className="glass-card bg-[#0e0e1a]/90 border border-[#1e1e30] rounded-xl p-4 flex flex-col justify-between shadow-md hover:border-[#2a2a44] transition-all duration-200">
          <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
            <span className="font-medium text-[11px] text-gray-400 tracking-wide">Geometri Pit</span>
            <Compass size={16} className="text-indigo-400/90" />
          </div>
          <div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">Kedalaman (ΔZ):</span>
              <span className="text-lg font-bold font-mono tabular-nums text-cyan-300">{pitDepthStr}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xs text-gray-400">Blok Tergali:</span>
              <span className="text-xs font-mono tabular-nums font-semibold text-gray-200">
                {minedBlockCount.toLocaleString('id-ID')} / {totalBlockCount.toLocaleString('id-ID')} ({minedPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-[#181826] h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, minedPercent)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section: Evaluasi NPV Indikatif (Pit Selection Table) ── */}
      <div className="bg-[#0e0e1a]/90 border border-[#1e1e30] rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1c1c2c]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <h2 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
              Analisis NPV Indikatif & Pemilihan Pit Shell (Pit Selection)
            </h2>
          </div>
          {pitSelection && (
            <span className="text-[11px] text-gray-400 font-mono tabular-nums">
              Dasar: <strong className="text-amber-300 font-medium">{pitSelection.valuation_basis}</strong>
            </span>
          )}
        </div>

        {pitSelectionError && (
          <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-lg text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-400 shrink-0" />
            <span>Kalkulasi NPV Indikatif tidak dapat diproses: {pitSelectionError}</span>
          </div>
        )}

        {pitSelection ? (
          <PitSelectionTable
            pitSelection={pitSelection}
            currency={financialParams.currency || 'IDR'}
          />
        ) : !pitSelectionError ? (
          <div className="p-4 bg-[#0a0a14] border border-[#1c1c2c] rounded-lg text-xs text-gray-400 flex items-start gap-3">
            <Info size={17} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-gray-200">
                Analisis NPV Indikatif Belum Diaktifkan
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Untuk mengaktifkan evaluasi umur tambang (*Life of Mine*) dan skenario NPV (*Shell vs Bench*),
                masukkan nilai <strong>Kapasitas Produksi Ore (ton/tahun)</strong> pada panel Parameter Finansial di tab 3D Workspace, lalu jalankan ulang optimasi.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Section: Lithology Breakdown & Project Metadata (2 Columns) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Lithology Breakdown Table */}
        <div className="bg-[#0e0e1a]/90 border border-[#1e1e30] rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1c1c2c]">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-indigo-400" />
              <h2 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                Distribusi Domain Litologi Tergali
              </h2>
            </div>
            <span className="text-[11px] text-gray-500 font-mono tabular-nums">
              {lithologyBreakdown.length} Domain
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1c1c2c] text-[10px] uppercase tracking-wider text-gray-400 font-mono">
                  <th className="pb-2">Domain Litologi</th>
                  <th className="pb-2 text-right">Bijih (t)</th>
                  <th className="pb-2 text-right">Waste (t)</th>
                  <th className="pb-2 text-right">Total (t)</th>
                  <th className="pb-2 text-right">Kadar Rata²</th>
                  <th className="pb-2 text-right">Porsi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161624] font-mono tabular-nums text-[11px]">
                {lithologyBreakdown.map((item) => {
                  const color = lithologyColors[item.rock] || '#718096';
                  return (
                    <tr key={item.rock} className="hover:bg-[#131322] transition-colors">
                      <td className="py-2.5 flex items-center gap-2 font-sans font-medium text-gray-200">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate max-w-[120px]">{item.rock}</span>
                      </td>
                      <td className="py-2.5 text-right text-amber-300">{fmtId(item.oreTonnage, 0)}</td>
                      <td className="py-2.5 text-right text-gray-400">{fmtId(item.wasteTonnage, 0)}</td>
                      <td className="py-2.5 text-right text-gray-200 font-semibold">{fmtId(item.totalTonnage, 0)}</td>
                      <td className="py-2.5 text-right text-yellow-400">
                        {item.oreTonnage > 0 ? `${fmtId(item.avgGrade, 3)} ${gradeLabel}` : '-'}
                      </td>
                      <td className="py-2.5 text-right text-indigo-300">{item.sharePercent.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Technical Parameters & Metadata */}
        <div className="bg-[#0e0e1a]/90 border border-[#1e1e30] rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1c1c2c]">
            <div className="flex items-center gap-2">
              <Compass size={15} className="text-cyan-400" />
              <h2 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                Parameter Proyek & Metadata Spasial
              </h2>
            </div>
            <span className="text-[11px] text-gray-500 font-mono">
              Snapshot v2.0.1
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Parameters column */}
            <div className="space-y-2 bg-[#090914] p-3 rounded-lg border border-[#1d1d2e]">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Parameter Finansial & Geometri
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Harga Komoditas:</span>
                <span className="font-mono tabular-nums text-gray-200">{fmtCur(financialParams.commodity_price)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Biaya Tambang Ore:</span>
                <span className="font-mono tabular-nums text-gray-200">{fmtCur(financialParams.ore_mining_cost)}/t</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Biaya Tambang Waste:</span>
                <span className="font-mono tabular-nums text-gray-200">{fmtCur(financialParams.waste_mining_cost)}/t</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Biaya Pengolahan:</span>
                <span className="font-mono tabular-nums text-gray-200">{fmtCur(financialParams.processing_cost)}/t</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Cut-off Grade:</span>
                <span className="font-mono tabular-nums text-yellow-400">{fmtId(financialParams.cut_off_grade, 4)} {gradeLabel}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Overall Slope Angle (OSA):</span>
                <span className="font-mono tabular-nums text-cyan-300 font-bold">{financialParams.osa}°</span>
              </div>
            </div>

            {/* Spatial & Model column */}
            <div className="space-y-2 bg-[#090914] p-3 rounded-lg border border-[#1d1d2e]">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Metadata Spasial & Model
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Berkas Masukan:</span>
                <span className="font-mono text-gray-200 truncate max-w-[110px]" title={csvFile?.name ?? '-'}>
                  {csvFile?.name ?? 'Model Blok'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Dimensi Voxel:</span>
                <span className="font-mono tabular-nums text-gray-200">{blockSizeStr}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Total Blok Model:</span>
                <span className="font-mono tabular-nums text-gray-200">{totalBlockCount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Sistem Koordinat:</span>
                <span className="font-mono text-cyan-300 text-[10px]">
                  {coordinateSystem || (utmZone ? `UTM ${utmZone}${utmHemisphere}` : 'Lokal / Grid')}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#181826]">
                <span className="text-gray-400">Batas Pit (Polygon):</span>
                <span className="font-mono text-gray-200">
                  {pitBoundaryPolygons?.length > 0 ? `${pitBoundaryPolygons.length} Polygon KML` : 'Bebas'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Titik Topografi:</span>
                <span className="font-mono tabular-nums text-gray-200">
                  {kmlMetadata ? kmlMetadata.topo_point_count.toLocaleString('id-ID') : 'Dari Model'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
