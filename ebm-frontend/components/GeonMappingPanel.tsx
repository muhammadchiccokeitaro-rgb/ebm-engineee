'use client';

import React from 'react';
import { useEBMStore } from '../store/ebmStore';
import { Network, ChevronDown } from 'lucide-react';

export default function GeonMappingPanel() {
  const {
    geonEnabled,
    geonMapping,
    setGeonEnabled,
    setGeonMapping,
    financialParams,
    lithologies,
    setFinancialParam,
  } = useEBMStore();

  const handleToggle = () => {
    const next = !geonEnabled;
    setGeonEnabled(next);
    // Seed mapping dari lithologies yang sudah ada, gunakan OSA global sebagai default
    if (next && lithologies.length > 0) {
      const seeded: Record<string, number> = {};
      lithologies.forEach((l) => {
        seeded[l] = geonMapping[l] ?? financialParams.osa;
      });
      setGeonMapping(seeded);
    }
  };

  const handleOsaChange = (rockType: string, val: number) => {
    setGeonMapping({ ...geonMapping, [rockType]: val });
  };

  return (
    <div className="bg-[#1A1A26] rounded-lg border border-[#2A2A3A] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Network size={13} className="text-violet-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-300">Sudut Lereng</span>
          {geonEnabled && (
            <span className="text-[10px] bg-violet-600/20 text-violet-300 border border-violet-500/30 px-1.5 py-0.5 rounded font-mono">
              GEON
            </span>
          )}
        </div>

        {/* Toggle switch */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <span className="text-[10px] text-gray-500">
            {geonEnabled ? 'Domain' : 'Global'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={geonEnabled}
            onClick={handleToggle}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${
              geonEnabled ? 'bg-violet-600' : 'bg-[#2A2A3A]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                geonEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Body */}
      <div className="px-3 pb-3 space-y-2">
        {!geonEnabled ? (
          /* ── Mode Global: input OSA tunggal ── */
          <div className="flex items-center justify-between gap-2 bg-[#12121C] px-2.5 py-2 rounded border border-[#2A2A3A]">
            <span className="text-xs text-gray-400">OSA Global</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={89}
                step={1}
                value={financialParams.osa}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= 1 && v <= 89) setFinancialParam('osa', v);
                }}
                className="w-14 bg-transparent text-[#F1F1F4] font-mono text-xs border-0 text-right focus:outline-none"
              />
              <span className="text-xs text-gray-500">°</span>
            </div>
          </div>
        ) : (
          /* ── Mode GEON: tabel per-RockType ── */
          <>
            {lithologies.length === 0 ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded px-2.5 py-2 text-[11px] text-amber-300 leading-tight">
                Jalankan optimasi sekali dulu agar RockType terdeteksi dari CSV,
                lalu aktifkan GEON kembali.
              </div>
            ) : (
              <div className="space-y-1.5">
                {lithologies.map((litho) => (
                  <div
                    key={litho}
                    className="flex items-center justify-between gap-2 bg-[#12121C] px-2.5 py-1.5 rounded border border-[#2A2A3A] group hover:border-violet-500/40 transition-colors"
                  >
                    <span
                      className="text-[11px] text-gray-300 font-mono truncate max-w-[130px]"
                      title={litho}
                    >
                      {litho}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={89}
                        step={1}
                        value={geonMapping[litho] ?? financialParams.osa}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) handleOsaChange(litho, v);
                        }}
                        className="w-14 bg-[#1A1A26] group-hover:bg-[#22223A] text-[#F1F1F4] font-mono text-xs border border-[#2A2A3A] group-hover:border-violet-500/50 rounded px-2 py-0.5 text-right focus:outline-none focus:border-violet-500 transition-colors"
                      />
                      <span className="text-[11px] text-gray-500 w-4">°</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-600 italic pt-0.5">
              Gigi 2 aktif — setiap domain litologi menggunakan OSA-nya masing-masing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
