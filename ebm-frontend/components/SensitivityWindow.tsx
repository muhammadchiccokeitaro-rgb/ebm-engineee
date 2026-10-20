'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEBMStore, getInitialApiUrl } from '../store/ebmStore';
import { X, Minus, RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface SensitivityResult {
  scenario: string;
  price_factor: number;
  commodity_price: number;
  total_npv: number;
  total_ore_tonnage: number;
  total_waste_tonnage: number;
  stripping_ratio: number;
}

interface SensitivityWindowProps {
  onClose: () => void;
  onMinimize: () => void;
  chartRef?: React.RefObject<any>;
}

const LOADING_TEXTS = [
  "Mengumpulkan data blok tertambang...",
  "Membangun skenario fluktuasi harga komoditas...",
  "Menghitung ulang valuasi Undiscounted Pit Value (-20% & -10%)...",
  "Menghitung ulang valuasi Undiscounted Pit Value (+10% & +20%)...",
  "Menyusun matriks Stripping Ratio...",
  "Merender grafik analitik..."
];

export default function SensitivityWindow({ onClose, onMinimize, chartRef }: SensitivityWindowProps) {
  const { financialParams, csvFile, apiUrl, geonEnabled, geonMapping } = useEBMStore();
  const [results, setResults] = useState<SensitivityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const runAnalysis = useCallback(async () => {
    if (!csvFile) {
      setError('Silakan muat berkas Block Model (CSV) terlebih dahulu.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        ...financialParams,
        ...(geonEnabled && Object.keys(geonMapping).length > 0
          ? { geon_mapping: geonMapping }
          : { geon_mapping: null }),
      };

      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('financial_params', JSON.stringify(payload));

      const apiBase = apiUrl || getInitialApiUrl();
      const res = await fetch(`${apiBase}/api/sensitivity`, { method: 'POST', body: formData });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let detailMsg: string = '';
        if (typeof err.detail === 'string') {
          detailMsg = err.detail;
        } else if (Array.isArray(err.detail)) {
          detailMsg = err.detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; ');
        } else if (err.detail && typeof err.detail === 'object') {
          detailMsg = JSON.stringify(err.detail);
        } else {
          detailMsg = err.message || `Server error (Status ${res.status})`;
        }
        throw new Error(detailMsg);
      }

      const data = await res.json();
      setResults(data.scenarios || []);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [financialParams, csvFile, apiUrl, geonEnabled, geonMapping]);

  useEffect(() => {
    if (csvFile) {
      runAnalysis();
    }
  }, [csvFile, runAnalysis]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < LOADING_TEXTS.length - 1 ? prev + 1 : prev));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const curr = financialParams.currency || 'IDR';
  const fmtCur = (v: number) => {
    try {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: curr,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(v);
    } catch {
      return `${curr} ${new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`;
    }
  };

  const chartData = {
    labels: results.map(r => r.scenario),
    datasets: [{
      label: 'Undiscounted Pit Value',
      data: results.map(r => r.total_npv),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.08)',
      borderWidth: 2,
      pointBackgroundColor: results.map(r => r.price_factor === 0 ? '#ffffff' : '#10b981'),
      pointRadius: results.map(r => r.price_factor === 0 ? 6 : 4),
      pointHoverRadius: 8,
      tension: 0.35,
      fill: true,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0e0e1a',
        borderColor: '#26263a',
        borderWidth: 1,
        titleColor: '#94a3b8',
        bodyColor: '#f1f5f9',
        padding: 10,
        callbacks: {
          label: (ctx: any) => {
            const r = results[ctx.dataIndex];
            if (!r) return '';
            return [
              '  Undiscounted Pit Value: ' + fmtCur(r.total_npv),
              '  Ore: ' + r.total_ore_tonnage.toLocaleString('id-ID') + ' t',
              '  SR: ' + r.stripping_ratio.toFixed(2),
            ];
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Skenario Perubahan Harga', color: '#94a3b8', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.03)' },
        ticks: { color: '#64748b', font: { size: 10 } },
        border: { color: '#1e1e30' },
      },
      y: {
        title: { display: true, text: `Undiscounted Pit Value (${curr})`, color: '#94a3b8', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.03)' },
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          callback: (v: any) => fmtCur(Number(v)),
        },
        border: { color: '#1e1e30' },
      },
    },
  };

  const baseResult = results.find(r => r.price_factor === 0);

  return (
    <div className="flex flex-col h-full bg-[#0a0a14] rounded-xl overflow-hidden border border-[#1e1e30] shadow-2xl">
      {/* Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0e0e1a] border-b border-[#1e1e30] cursor-grab active:cursor-grabbing window-drag-handle shrink-0 select-none">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-emerald-400" />
          <span className="text-xs font-semibold text-gray-100 tracking-wide">Sensitivity Analysis</span>
          {results.length > 0 && (
            <span className="text-[10px] text-gray-500 font-mono hidden sm:inline ml-1">
              Undiscounted Pit Value vs Harga Komoditas
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={runAnalysis}
            disabled={loading}
            title="Hitung ulang sensitivitas"
            className="p-1.5 rounded-md hover:bg-[#1c1c2e] text-gray-400 hover:text-emerald-400 transition-colors btn-tactile active:scale-95"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onMinimize}
            title="Minimize"
            className="p-1.5 rounded-md hover:bg-[#1c1c2e] text-gray-400 hover:text-amber-400 transition-colors btn-tactile active:scale-95"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={onClose}
            title="Tutup"
            className="p-1.5 rounded-md hover:bg-rose-950/50 text-gray-400 hover:text-rose-400 transition-colors btn-tactile active:scale-95"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
        {/* Error Notification */}
        {error && (
          <div className="rounded-lg bg-rose-950/40 border border-rose-800/50 px-3.5 py-2.5 text-rose-300 text-xs flex items-start gap-2.5 shadow-sm">
            <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-emerald-400/90 text-xs font-mono animate-pulse text-center transition-all duration-300 min-h-[20px]">
              {LOADING_TEXTS[loadingStep]}
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
            <div className="w-12 h-12 rounded-xl bg-[#141422] border border-[#232338] flex items-center justify-center text-gray-500">
              <TrendingUp size={24} />
            </div>
            <p className="text-gray-400 text-xs max-w-sm leading-relaxed">
              Muat berkas model blok (CSV) lalu klik tombol jalankan untuk menghitung matriks sensitivitas harga.
            </p>
            <button
              onClick={runAnalysis}
              className="mt-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-md text-xs font-semibold transition-all shadow-md btn-tactile cursor-pointer"
            >
              Jalankan Analisis
            </button>
          </div>
        )}

        {/* Results View */}
        {!loading && results.length > 0 && (
          <>
            {baseResult && (
              <div className="grid grid-cols-3 gap-2.5 shrink-0">
                {[
                  { label: 'Baseline Pit Value', value: fmtCur(baseResult.total_npv), color: 'text-emerald-400' },
                  { label: 'Ore Tonnage', value: (baseResult.total_ore_tonnage / 1e6).toFixed(2) + ' Mt', color: 'text-blue-400' },
                  { label: 'Stripping Ratio', value: baseResult.stripping_ratio.toFixed(2), color: 'text-cyan-400' },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#0e0e1a] border border-[#1e1e30] rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">{stat.label}</p>
                    <p className={'text-sm font-bold font-mono tabular-nums mt-0.5 ' + stat.color}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 min-h-0 relative bg-[#0e0e1a]/60 border border-[#1e1e30] rounded-lg p-2" id="sensitivity-chart-container">
              <Line ref={chartRef} data={chartData} options={chartOptions as any} />
            </div>
            <div className="shrink-0 overflow-x-auto max-h-32 overflow-y-auto rounded-lg border border-[#1e1e30]">
              <table className="w-full text-xs font-mono tabular-nums">
                <thead className="sticky top-0 bg-[#0e0e1a] text-gray-400 border-b border-[#1e1e30]">
                  <tr>
                    {['Skenario', 'Harga Komoditas', 'Undiscounted Pit Value', 'SR'].map(h => (
                      <th key={h} className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#161624] bg-[#0c0c16]">
                  {results.map((r, i) => (
                    <tr key={i} className={'hover:bg-[#131322] transition-colors ' + (r.price_factor === 0 ? 'bg-emerald-950/20' : '')}>
                      <td className={'px-3 py-1.5 font-medium ' + (r.price_factor === 0 ? 'text-emerald-400' : 'text-gray-300')}>{r.scenario}</td>
                      <td className="px-3 py-1.5 text-gray-400">{r.commodity_price.toLocaleString('id-ID')}</td>
                      <td className={'px-3 py-1.5 font-semibold ' + (r.total_npv >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{fmtCur(r.total_npv)}</td>
                      <td className="px-3 py-1.5 text-gray-400">{r.stripping_ratio.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
