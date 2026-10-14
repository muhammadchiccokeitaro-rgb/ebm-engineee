'use client';

/**
 * NestedPitWindow.tsx — Pillar 7B: Nested Pit / Strategic Shell Visualization
 *
 * Floating draggable window (identik dengan SensitivityWindow).
 * Menampilkan grafik Pit Value vs Revenue Factor menggunakan chart.js,
 * kartu metrik per-shell, dan kontrol playback.
 *
 * PENTING: Ini adalah shell pit yang dihasilkan secara matematis (Revenue Factor
 * parametrization). BUKAN operational pushback.
 * Filter First_RF pada 3D viewer TIDAK diubah di sini.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart2, Minus, X, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useEBMStore, NestedPitShell } from '../store/ebmStore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface NestedPitWindowProps {
  onClose: () => void;
  onMinimize: () => void;
}

// ─── Formatters (identical to SensitivityWindow) ───────────────────────────
function fmtCur(v: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(v);
}
function fmtTon(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' Mt';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + ' kt';
  return v.toFixed(0) + ' t';
}

// ─── Shell palette (consistent with PitViewer3D pushback phase colors) ──────
const SHELL_COLORS = ['#f1c40f', '#e67e22', '#c0392b', '#8e44ad', '#16a085', '#2980b9'];

export default function NestedPitWindow({ onClose, onMinimize }: NestedPitWindowProps) {
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
  const chartRef = useRef<any>(null);

  const totalShells = nestedPits.length;
  const activeIdx = Math.max(0, Math.min(activeShell - 1, totalShells - 1));
  const activePit: NestedPitShell | null = nestedPits[activeIdx] ?? null;
  const currency = financialParams.currency ?? 'IDR';

  // ─── Play logic ────────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    if (isPlaying) {
      if (playRef.current) clearInterval(playRef.current);
      setIsPlaying(false);
      return;
    }
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
    }, 1100);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, totalShells, setActiveShell]);

  // ─── Chart.js data ─────────────────────────────────────────────────────────
  const chartData = {
    labels: nestedPits.map(p => `RF ${p.rf.toFixed(2)}`),
    datasets: [
      {
        label: 'Pit Value',
        data: nestedPits.map(p => p.pit_value),
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0,255,136,0.07)',
        borderWidth: 2.5,
        pointBackgroundColor: nestedPits.map((_, i) =>
          i + 1 === activeShell ? '#ffffff' : '#00ff88'
        ),
        pointBorderColor: nestedPits.map((_, i) =>
          i + 1 === activeShell ? SHELL_COLORS[i] : '#00ff88'
        ),
        pointBorderWidth: nestedPits.map((_, i) => (i + 1 === activeShell ? 3 : 1)),
        pointRadius: nestedPits.map((_, i) => (i + 1 === activeShell ? 9 : 5)),
        pointHoverRadius: 10,
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    onClick: (_evt: any, elements: any[]) => {
      if (elements.length > 0) {
        setActiveShell(elements[0].index + 1);
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e1e2d',
        borderColor: '#2a2a42',
        borderWidth: 1,
        titleColor: '#a0a0b0',
        bodyColor: '#fff',
        callbacks: {
          label: (ctx: any) => {
            const p = nestedPits[ctx.dataIndex];
            if (!p) return '';
            return [
              `  Pit Value: ${fmtCur(p.pit_value, currency)}`,
              `  Ore: ${fmtTon(p.ore_tonnage)}`,
              `  Waste: ${fmtTon(p.waste_tonnage)}`,
              `  SR: ${p.strip_ratio.toFixed(2)}`,
            ];
          },
          title: (items: any[]) => {
            const p = nestedPits[items[0]?.dataIndex];
            return p ? `Shell ${items[0].dataIndex + 1} · RF ${p.rf.toFixed(2)}` : '';
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Revenue Factor', color: '#a0a0b0', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#7070a0', font: { size: 11 } },
        border: { color: '#333' },
      },
      y: {
        title: { display: true, text: `Pit Value (${currency})`, color: '#a0a0b0', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#7070a0',
          font: { size: 10 },
          callback: (v: any) => fmtCur(Number(v), currency),
        },
        border: { color: '#333' },
      },
    },
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#12121f] rounded-lg overflow-hidden">

      {/* ── Header (drag handle – identical to SensitivityWindow) ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a2e] border-b border-[#2a2a42] cursor-grab active:cursor-grabbing window-drag-handle shrink-0 select-none">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-amber-400" />
          <span className="text-sm font-semibold text-white">Nested Pit Analysis</span>
          {nestedPits.length > 0 && (
            <span className="text-xs text-gray-500 ml-1">Pit Value vs Revenue Factor</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Nesting validation badge */}
          {nestingValidation && (
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full mr-1 ${
                nestingValidation.nested
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
              title={
                nestingValidation.nested
                  ? 'Nested property validated: Pit(RF₁) ⊆ Pit(RF₂) ⊆ Pit(RF₃)'
                  : `Nesting violation: ${nestingValidation.violations?.join('; ')}`
              }
            >
              {nestingValidation.nested ? '✓ VALID' : '⚠ VIOLATION'}
            </span>
          )}
          <button
            onClick={onMinimize}
            className="p-1.5 rounded hover:bg-[#2a2a42] text-gray-400 hover:text-yellow-400 transition-colors"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">

        {/* Empty state */}
        {nestedPits.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <BarChart2 size={36} className="text-gray-600" />
            <p className="text-gray-400 text-sm">
              Jalankan optimasi dengan beberapa Revenue Factor untuk melihat analisis nested pit.
            </p>
            <p className="text-gray-600 text-xs">
              Contoh: revenue_factors = [0.6, 0.8, 1.0]
            </p>
          </div>
        )}

        {/* Content – only if we have data */}
        {nestedPits.length > 0 && (
          <>
            {/* ── Summary Cards (same style as SensitivityWindow) ── */}
            {activePit && (
              <div className="grid grid-cols-4 gap-2 shrink-0">
                {[
                  {
                    label: 'Pit Value',
                    value: fmtCur(activePit.pit_value, currency),
                    color: 'text-emerald-400',
                    sublabel: 'Undiscounted',
                  },
                  {
                    label: 'Ore Tonnage',
                    value: fmtTon(activePit.ore_tonnage),
                    color: 'text-amber-400',
                    sublabel: '',
                  },
                  {
                    label: 'Waste',
                    value: fmtTon(activePit.waste_tonnage),
                    color: 'text-slate-400',
                    sublabel: '',
                  },
                  {
                    label: 'Strip Ratio',
                    value: activePit.strip_ratio.toFixed(2),
                    color: 'text-purple-400',
                    sublabel: 'W:O',
                  },
                ].map(stat => (
                  <div
                    key={stat.label}
                    className="bg-[#1e1e30] border border-[#2a2a42] rounded-md px-3 py-2"
                  >
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                      {stat.label}
                      {stat.sublabel && (
                        <span className="ml-1 text-[9px] text-gray-600 normal-case">
                          ({stat.sublabel})
                        </span>
                      )}
                    </p>
                    <p className={`text-sm font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Chart ── */}
            <div
              className="flex-1 min-h-0 relative cursor-pointer"
              title="Klik pada titik grafik untuk memilih shell"
            >
              <Line ref={chartRef} data={chartData} options={chartOptions as any} />
            </div>

            {/* ── Shell pill indicator ── */}
            <div className="flex items-center justify-center gap-2 shrink-0">
              {nestedPits.map((pit, idx) => (
                <button
                  key={pit.rf}
                  onClick={() => setActiveShell(idx + 1)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                    idx + 1 === activeShell
                      ? 'border-transparent text-[#12121f]'
                      : 'bg-transparent border-[#2a2a42] text-gray-500 hover:border-gray-500'
                  }`}
                  style={
                    idx + 1 === activeShell
                      ? { backgroundColor: SHELL_COLORS[idx] ?? '#6b7280' }
                      : {}
                  }
                >
                  <span>Shell {idx + 1}</span>
                  <span className="opacity-70">·</span>
                  <span>RF {pit.rf.toFixed(2)}</span>
                </button>
              ))}
            </div>

            {/* ── Playback Controls ── */}
            {nestedPits.length > 1 && (
              <div className="flex items-center justify-center gap-2 shrink-0 pt-1 border-t border-[#1e1e30]">
                <button
                  onClick={() => setActiveShell(Math.max(1, activeShell - 1))}
                  disabled={activeShell <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold rounded-md bg-[#1e1e30] hover:bg-[#2a2a42] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <SkipBack size={11} />
                  Prev
                </button>

                <button
                  onClick={handlePlay}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                    isPlaying
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {isPlaying ? <Square size={11} /> : <Play size={11} />}
                  {isPlaying ? 'Stop' : 'Play'}
                </button>

                <button
                  onClick={() => setActiveShell(Math.min(totalShells, activeShell + 1))}
                  disabled={activeShell >= totalShells}
                  className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold rounded-md bg-[#1e1e30] hover:bg-[#2a2a42] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Next
                  <SkipForward size={11} />
                </button>
              </div>
            )}

            {/* ── Incremental shell info ── */}
            {incrementalShells[activeIdx] && (
              <p className="text-[10px] text-gray-600 text-center shrink-0">
                {activePit?.block_count.toLocaleString()} blok kumulatif ·{' '}
                +{incrementalShells[activeIdx].block_count.toLocaleString()} blok baru di shell ini
              </p>
            )}

            {/* ── Disclaimer ── */}
            <p className="text-[9px] text-gray-700 italic text-center shrink-0">
              Strategic Shells ≠ Operational Pushbacks · Pillar 7B EBM Engine
            </p>
          </>
        )}
      </div>
    </div>
  );
}
