'use client';

import React from 'react';
import { PitSelectionResult } from '../store/ebmStore';

interface Props {
  pitSelection: PitSelectionResult;
  currency: string;
}

const fmtID = (v: number, dec = 0) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(v);

const fmtCur = (v: number, curr: string) => `${curr} ${fmtID(v, 0)}`;

export default function PitSelectionTable({ pitSelection, currency }: Props) {
  const { candidates, recommendation, assumptions, valuation_basis } = pitSelection;
  if (!candidates || candidates.length === 0) return null;

  const maxNpvBest = Math.max(...candidates.map((c) => c.npv_best));
  const maxNpvWorst = Math.max(...candidates.map((c) => c.npv_worst));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-amber-400 font-mono text-[10px] border border-amber-700/40 bg-amber-900/20 px-1.5 py-0.5 rounded uppercase tracking-wider">NPV</span>
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Analisis NPV Indikatif</h3>
      </div>

      {/* Valuation basis */}
      <div className="text-[10px] text-gray-500 font-mono">
        Dasar penilaian: {valuation_basis} — BEV dan tonase dari snapshot RF=1,0
      </div>

      {/* Main table — scrollable horizontally */}
      <div className="overflow-x-auto rounded border border-[#2A2A3A]">
        <table className="w-full text-[10px] font-mono border-collapse">
          <thead>
            <tr className="bg-[#1A1A30] text-gray-500 border-b border-[#2A2A3A]">
              <th className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">RF</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">Undiscounted</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">Ore (t)</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">Waste (t)</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">W:O</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">Umur (th)</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">NPV terbaik↓</th>
              <th className="text-right px-2 py-1.5 font-semibold whitespace-nowrap">NPV terburuk↓</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const isBestRF = c.rf === recommendation.best_case_rf;
              const isWorstRF = c.rf === recommendation.worst_case_rf;
              const highlightBest = c.npv_best === maxNpvBest && maxNpvBest > 0;
              const highlightWorst = c.npv_worst === maxNpvWorst && maxNpvWorst > 0;
              return (
                <tr
                  key={c.rf}
                  className={`border-b border-[#222230] transition-colors ${
                    isBestRF || isWorstRF ? 'bg-amber-950/20' : 'hover:bg-[#1A1A24]'
                  }`}
                >
                  <td className="px-2 py-1.5 text-left font-bold text-amber-300">
                    {fmtID(c.rf, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-300">
                    {fmtCur(c.undiscounted_value, currency)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-300">
                    {fmtID(c.ore_tonnes, 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-300">
                    {fmtID(c.waste_tonnes, 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-400">
                    {fmtID(c.stripping_ratio, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-400">
                    {c.mine_life_years.best}–{c.mine_life_years.worst}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${highlightBest ? 'text-green-400' : 'text-gray-300'}`}>
                    {highlightBest && <span className="mr-0.5 text-green-500">★</span>}
                    {fmtCur(c.npv_best, currency)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${highlightWorst ? 'text-cyan-400' : 'text-gray-300'}`}>
                    {highlightWorst && <span className="mr-0.5 text-cyan-500">★</span>}
                    {fmtCur(c.npv_worst, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recommendation */}
      {(recommendation.best_case_rf !== null) && (
        <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded p-2 space-y-1">
          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Rekomendasi Indikatif</div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500">RF terbaik (urutan atas→bawah):</span>
            <span className="font-mono font-bold text-green-400">RF {fmtID(recommendation.best_case_rf!, 2)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500">RF terbaik (urutan bebas Z):</span>
            <span className="font-mono font-bold text-cyan-400">RF {fmtID(recommendation.worst_case_rf!, 2)}</span>
          </div>
          {recommendation.recommendations_differ && (
            <div className="text-[10px] text-amber-400 italic pt-1">
              ⚠ Dua urutan menghasilkan RF terbaik berbeda — lihat catatan di bawah.
            </div>
          )}
        </div>
      )}

      {/* Assumptions & notes */}
      <div className="bg-[#111118] border border-[#222230] rounded p-2 space-y-1">
        <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">Catatan Asumsi</div>
        <div className="text-[10px] text-gray-600 leading-relaxed space-y-0.5">
          <div>• Tanpa CAPEX, tanpa kapasitas penambangan terpisah, tanpa batas lebar pit operasional.</div>
          <div>• Urutan "NPV terbaik↓": RF naik → Z turun (atas ke bawah per shell). Urutan "NPV terburuk↓": Z turun saja.</div>
          <div>• Diskonto akhir tahun; tahun pertama bernomor 1. Tonase ore menentukan tahun; waste mengikuti posisi kumulatifnya.</div>
          <div>• Kedua urutan adalah batas indikatif — tidak ada jaminan salah satunya lebih tinggi dalam jadwal operasional nyata.</div>
          <div>• Hasil ini <span className="text-amber-400 font-semibold">bukan NPV final</span> dan bukan jadwal produksi.</div>
          {assumptions.valuation_basis && (
            <div>• Nilai BEV dari snapshot harga dasar RF=1,0 ({assumptions.valuation_basis}).</div>
          )}
        </div>
      </div>
    </div>
  );
}
