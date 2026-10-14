'use client';

/**
 * NestedPitSlider.tsx — Pillar 7B: Nested Pit / Strategic Shell Visualization
 *
 * Displays a slider UI for stepping through nested pit shells (RF scenarios).
 * Uses `nestedPits`, `incrementalShells`, `activeShell`, and `setActiveShell`
 * from the Zustand store. Does NOT duplicate pitBlocks; visibility is filtered
 * locally in PitViewer3D based on `First_RF`.
 *
 * IMPORTANT: This is NOT operational pushback generation.
 * These are economically-optimized nested pit shells generated via Revenue Factor
 * parametrization of the Maximum Closure algorithm.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useEBMStore, NestedPitShell } from '../store/ebmStore';

function formatLargeNumber(val: number, currency: string = 'IDR'): string {
  if (Math.abs(val) >= 1e12) return `${currency} ${(val / 1e12).toFixed(2)} T`;
  if (Math.abs(val) >= 1e9)  return `${currency} ${(val / 1e9).toFixed(2)} M`;
  if (Math.abs(val) >= 1e6)  return `${currency} ${(val / 1e6).toFixed(2)} Jt`;
  return `${currency} ${val.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

function formatTonnage(val: number): string {
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)} Mt`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)} kt`;
  return `${val.toFixed(0)} t`;
}

export default function NestedPitSlider() {
  const {
    nestedPits,
    incrementalShells,
    nestingValidation,
    activeShell,
    setActiveShell,
    financialParams,
  } = useEBMStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only show when there are multiple shells (single RF = UPL only, no slider needed)
  const hasMultipleShells = nestedPits.length > 1;
  const hasAnyShells = nestedPits.length > 0;

  // Derive activeRF from activeShell index (1-based)
  const activeIdx = Math.max(0, Math.min(activeShell - 1, nestedPits.length - 1));
  const activePit: NestedPitShell | null = nestedPits[activeIdx] ?? null;
  const totalShells = nestedPits.length;

  // Shell color palette — matches Pushback Phase colors in PitViewer3D
  const SHELL_COLORS = [
    '#f1c40f', // Shell 1: Yellow
    '#e67e22', // Shell 2: Orange
    '#c0392b', // Shell 3: Dark red
    '#8e44ad', // Shell 4: Purple
    '#16a085', // Shell 5: Teal
    '#2980b9', // Shell 6+: Blue
  ];

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setActiveShell(Number(e.target.value));
  }, [setActiveShell]);

  // Play / auto-advance
  const handlePlay = useCallback(() => {
    if (isPlaying) {
      if (playRef.current) clearInterval(playRef.current);
      setIsPlaying(false);
      return;
    }
    // Reset to shell 1 if at end
    if (activeShell >= totalShells) setActiveShell(1);
    setIsPlaying(true);
  }, [isPlaying, activeShell, totalShells, setActiveShell]);

  useEffect(() => {
    if (!isPlaying) return;
    playRef.current = setInterval(() => {
      setActiveShell((prev: number) => {
        if (prev >= totalShells) {
          clearInterval(playRef.current!);
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, totalShells, setActiveShell]);

  // If no nested pit data, show nothing (backward compatible)
  if (!hasAnyShells) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 w-[420px] max-w-[96vw]">
      <div className="bg-[#0E1117]/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-bold text-white/80 tracking-widest uppercase">
              Nested Pit Analysis
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Nesting validation badge */}
            {nestingValidation && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  nestingValidation.nested
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
                title={
                  nestingValidation.nested
                    ? 'Nested pit property validated: P(RF₁) ⊆ P(RF₂) ⊆ P(RF₃)'
                    : `Nesting violation: ${nestingValidation.violations?.join('; ')}`
                }
              >
                {nestingValidation.nested ? '✓ VALID' : '⚠ VIOLATION'}
              </span>
            )}
            <span className="text-[9px] text-white/40 italic ml-1" title="Nested pit shells represent economically optimized pit limits at different revenue factors. They are not yet operational mining pushbacks.">
              ℹ
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3">

          {/* RF Label + Shell */}
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mb-0.5">Revenue Factor</p>
              <p className="text-2xl font-bold text-white font-mono leading-none">
                {activePit ? activePit.rf.toFixed(2) : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-white/40 uppercase tracking-widest mb-0.5">Strategic Shell</p>
              <p className="text-lg font-bold font-mono leading-none" style={{ color: SHELL_COLORS[activeIdx] ?? '#ffffff' }}>
                {hasMultipleShells ? `#${activeShell}` : 'UPL'}
              </p>
            </div>
          </div>

          {/* Slider — only if multiple shells */}
          {hasMultipleShells && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/40 font-mono w-8 text-left">
                  {nestedPits[0]?.rf.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={1}
                  max={totalShells}
                  step={1}
                  value={activeShell}
                  onChange={handleSliderChange}
                  className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #f59e0b ${((activeShell - 1) / Math.max(totalShells - 1, 1)) * 100}%, #374151 ${((activeShell - 1) / Math.max(totalShells - 1, 1)) * 100}%)`,
                  }}
                />
                <span className="text-[10px] text-white/40 font-mono w-8 text-right">
                  {nestedPits[nestedPits.length - 1]?.rf.toFixed(2)}
                </span>
              </div>

              {/* Shell tick marks */}
              <div className="flex justify-between mt-1 px-10">
                {nestedPits.map((pit, idx) => (
                  <button
                    key={pit.rf}
                    onClick={() => setActiveShell(idx + 1)}
                    className="flex flex-col items-center gap-0.5 group"
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full transition-all ${
                        idx + 1 <= activeShell ? 'scale-125' : 'opacity-40'
                      }`}
                      style={{ backgroundColor: SHELL_COLORS[idx] ?? '#6b7280' }}
                    />
                    <span className="text-[8px] font-mono text-white/30 group-hover:text-white/60 transition-colors">
                      {pit.rf.toFixed(1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Metrics row */}
          {activePit && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <p className="text-[9px] text-white/40 uppercase tracking-wider">Ore</p>
                <p className="text-sm font-bold text-amber-300 font-mono">{formatTonnage(activePit.ore_tonnage)}</p>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <p className="text-[9px] text-white/40 uppercase tracking-wider">Waste</p>
                <p className="text-sm font-bold text-slate-400 font-mono">{formatTonnage(activePit.waste_tonnage)}</p>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <p className="text-[9px] text-white/40 uppercase tracking-wider">Strip Ratio</p>
                <p className="text-sm font-bold text-blue-300 font-mono">{activePit.strip_ratio.toFixed(2)}</p>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <p className="text-[9px] text-white/40 uppercase tracking-wider">Pit Value (Undiscounted)</p>
                <p className="text-sm font-bold text-emerald-300 font-mono">{formatLargeNumber(activePit.pit_value, financialParams.currency ?? 'IDR')}</p>
              </div>
            </div>
          )}

          {/* Block count + incremental shell info */}
          {activePit && (
            <div className="flex items-center justify-between text-[10px] text-white/40 mb-3">
              <span>{activePit.block_count.toLocaleString()} blok dalam pit</span>
              {incrementalShells[activeIdx] && (
                <span className="text-white/30">
                  +{incrementalShells[activeIdx].block_count.toLocaleString()} blok baru di shell ini
                </span>
              )}
            </div>
          )}

          {/* Controls */}
          {hasMultipleShells && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setActiveShell(Math.max(1, activeShell - 1))}
                disabled={activeShell <= 1}
                className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ‹ Prev
              </button>
              <button
                onClick={handlePlay}
                className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                  isPlaying
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                }`}
              >
                {isPlaying ? '⏹ Stop' : '▶ Play'}
              </button>
              <button
                onClick={() => setActiveShell(Math.min(totalShells, activeShell + 1))}
                disabled={activeShell >= totalShells}
                className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 hover:bg-white/10 text-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next ›
              </button>
              <button
                onClick={() => setActiveShell(totalShells)}
                className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 hover:bg-white/10 text-white/40 transition-all"
                title="Show full UPL (all shells)"
              >
                UPL
              </button>
            </div>
          )}

          {/* Single shell / UPL only note */}
          {!hasMultipleShells && hasAnyShells && (
            <p className="text-[10px] text-white/30 italic text-center">
              Single RF={nestedPits[0]?.rf.toFixed(2)} — kirim beberapa revenue_factors untuk analisis nested pit.
            </p>
          )}

          {/* Disclaimer */}
          <p className="text-[8px] text-white/20 italic text-center mt-2">
            Strategic Shells ≠ Operational Pushbacks · Pillar 7B
          </p>
        </div>
      </div>
    </div>
  );
}
