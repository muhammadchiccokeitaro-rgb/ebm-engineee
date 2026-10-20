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

  const discRate = pitSelection.discount_rate ?? pitSelection.discount_rate_used;
  const prodCap = pitSelection.production_capacity_tpy ?? pitSelection.production_capacity_tpy_used;

  const fmtRate = (r: number | undefined) => {
    if (r == null || r === 0) return 'tidak diset (0%)';
    const pct = r * 100;
    return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
  };
  const fmtCap = (v: number | undefined) =>
    v != null ? `${new Intl.NumberFormat('id-ID').format(v)} t/tahun` : '—';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-amber-400 font-mono text-[10px] border border-amber-800/40 bg-amber-950/40 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold">NPV</span>
        <h3 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">Analisis NPV Indikatif</h3>
      </div>

      {/* Valuation basis */}
      <div className="text-[10px] text-gray-400 font-mono tabular-nums">
        Dasar penilaian: {valuation_basis} — BEV dan tonase dari snapshot RF=1,0
      </div>

      {/* Main table — scrollable horizontally */}
      <div className="overflow-x-auto rounded-lg border border-[#1e1e30] bg-[#0c0c16]">
        <table className="w-full text-[10px] font-mono tabular-nums border-collapse">
          <thead>
            <tr className="bg-[#111120] text-gray-400 border-b border-[#1e1e30]">
              <th className="text-left px-2.5 py-2 font-semibold whitespace-nowrap">RF</th>
              <th className="text-right px-2.5 py-2 font-semibold whitespace-nowrap">Undiscounted</th>
              <th className="text-right px-2.5 py-2 font-semibold whitespace-nowrap">Ore (t)</th>
              <th className="text-right px-2.5 py-2 font-semibold whitespace-nowrap">Waste (t)</th>
              <th className="text-right px-2.5 py-2 font-semibold whitespace-nowrap">W:O</th>
              <th className="text-right px-2.5 py-2 font-semibold whitespace-nowrap">Umur (th)</th>
              <th className="text-right px-2.5 py-2 font-semibold whitespace-nowrap">NPV shell demi shell</th>
              <th className="text-right px-2.5 py-2 font-semibold whitespace-nowrap">NPV bench demi bench</th>
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
                  className={`border-b border-[#181826] transition-colors ${
                    isBestRF || isWorstRF ? 'bg-amber-950/20' : 'hover:bg-[#141424]'
                  }`}
                >
                  <td className="px-2.5 py-2 text-left font-bold text-amber-300">
                    {fmtID(c.rf, 2)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-gray-200">
                    {fmtCur(c.undiscounted_value, currency)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-gray-300">
                    {fmtID(c.ore_tonnes, 0)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-gray-400">
                    {fmtID(c.waste_tonnes, 0)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-gray-400">
                    {fmtID(c.stripping_ratio, 2)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-gray-400">
                    {c.mine_life_years.best}–{c.mine_life_years.worst}
                  </td>
                  <td className={`px-2.5 py-2 text-right font-semibold ${highlightBest ? 'text-emerald-400' : 'text-gray-300'}`}>
                    {highlightBest && <span className="mr-1 text-emerald-400">★</span>}
                    {fmtCur(c.npv_best, currency)}
                  </td>
                  <td className={`px-2.5 py-2 text-right font-semibold ${highlightWorst ? 'text-cyan-400' : 'text-gray-300'}`}>
                    {highlightWorst && <span className="mr-1 text-cyan-400">★</span>}
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
        <div className="bg-[#0e0e18] border border-[#1e1e30] rounded-lg p-3 space-y-1.5">
          <div className="text-[10px] text-gray-300 font-semibold uppercase tracking-wider mb-1">Rekomendasi Indikatif</div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">RF optimal (shell demi shell):</span>
            <span className="font-mono tabular-nums font-bold text-emerald-400">RF {fmtID(recommendation.best_case_rf!, 2)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">RF optimal (bench demi bench):</span>
            <span className="font-mono tabular-nums font-bold text-cyan-400">RF {fmtID(recommendation.worst_case_rf!, 2)}</span>
          </div>
          <div className="text-[10px] text-gray-400 italic pt-0.5">
            Catatan: Kedua urutan adalah batas indikatif dan tidak ada jaminan salah satunya lebih tinggi.
          </div>
          {recommendation.recommendations_differ && (
            <div className="text-[10px] text-amber-400 italic pt-0.5">
              ⚠ Dua urutan menghasilkan RF terbaik berbeda — lihat catatan di bawah.
            </div>
          )}
        </div>
      )}

      {/* Assumptions & notes */}
      <div className="bg-[#090912] border border-[#1a1a28] rounded-lg p-3 space-y-1.5">
        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Catatan Asumsi</div>
        <div className="text-[10px] text-gray-400 leading-relaxed space-y-1">
          <div className="text-amber-400/90">
            • <span className="font-semibold text-gray-300">Discount rate dipakai:</span>{' '}
            <span className="font-mono tabular-nums text-amber-400">{fmtRate(discRate)}</span>
          </div>
          <div>
            • <span className="font-semibold text-gray-300">Kapasitas produksi:</span>{' '}
            <span className="font-mono tabular-nums text-gray-200">{fmtCap(prodCap)}</span>
          </div>
          <div>• Kedua urutan adalah batas indikatif dan tidak ada jaminan salah satunya lebih tinggi.</div>
          <div>• Urutan &quot;NPV shell demi shell&quot;: RF naik → Z turun (atas ke bawah per shell). Urutan &quot;NPV bench demi bench&quot;: Z turun saja.</div>
          <div>• Tanpa CAPEX, tanpa kapasitas penambangan terpisah, tanpa batas lebar pit operasional.</div>
          <div>• Diskonto akhir tahun; tahun pertama bernomor 1. Tonase ore menentukan tahun; waste mengikuti posisi kumulatifnya.</div>
          <div>• Hasil ini <span className="text-amber-400 font-semibold">bukan NPV final</span> dan bukan jadwal produksi.</div>
          {assumptions.valuation_basis && (
            <div>• Nilai BEV dari snapshot harga dasar RF=1,0 ({assumptions.valuation_basis}).</div>
          )}
        </div>
      </div>
    </div>
  );
}

