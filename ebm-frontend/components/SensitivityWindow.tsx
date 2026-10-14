'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEBMStore } from '../store/ebmStore';
import { X, Minus, RefreshCw, TrendingUp } from 'lucide-react';
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
  "Menghitung ulang valuasi Undiscounted Pit Value untuk skenario -20% dan -10%...",
  "Menghitung ulang valuasi Undiscounted Pit Value untuk skenario +10% dan +20%...",
  "Menyusun matriks Stripping Ratio...",
  "Merender grafik analitik..."
];

export default function SensitivityWindow({ onClose, onMinimize, chartRef }: SensitivityWindowProps) {
  const { financialParams, csvFile, apiUrl } = useEBMStore();
  const [results, setResults] = useState<SensitivityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const runAnalysis = useCallback(async () => {
    if (!csvFile) { setError('Upload file Block Model (CSV) terlebih dahulu.'); return; }
    setLoading(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('financial_params', JSON.stringify(financialParams));
      const apiBase = apiUrl || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001';
      const res = await fetch(`${apiBase}/api/sensitivity`, { method: 'POST', body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'API Error'); }
      const data = await res.json();
      setResults(data.scenarios || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [financialParams, csvFile]);

  useEffect(() => { if (csvFile) runAnalysis(); }, []);

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

  const fmtCur = (v: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 1 }).format(v);

  const chartData = {
    labels: results.map(r => r.scenario),
    datasets: [{
      label: 'Undiscounted Pit Value',
      data: results.map(r => r.total_npv),
      borderColor: '#00ff66',
      backgroundColor: 'rgba(0,255,102,0.08)',
      borderWidth: 2.5,
      pointBackgroundColor: results.map(r => r.price_factor === 0 ? '#ffffff' : '#00ff66'),
      pointRadius: results.map(r => r.price_factor === 0 ? 7 : 5),
      pointHoverRadius: 9,
      tension: 0.4,
      fill: true,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 800 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e1e2d', borderColor: '#444', borderWidth: 1,
        titleColor: '#a0a0b0', bodyColor: '#fff',
        callbacks: {
          label: (ctx: any) => {
            const r = results[ctx.dataIndex];
            if (!r) return '';
            return ['  Undiscounted Pit Value: ' + fmtCur(r.total_npv), '  Ore: ' + r.total_ore_tonnage.toLocaleString('id-ID') + ' t', '  SR: ' + r.stripping_ratio.toFixed(2)];
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Skenario Perubahan Harga', color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7070a0', font: { size: 11 } }, border: { color: '#333' } },
      y: { title: { display: true, text: 'Undiscounted Pit Value (Rp)', color: '#a0a0b0' }, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7070a0', font: { size: 10 }, callback: (v: any) => fmtCur(Number(v)) }, border: { color: '#333' } },
    },
  };

  const baseResult = results.find(r => r.price_factor === 0);

  return (
    <div className="flex flex-col h-full bg-[#12121f] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a2e] border-b border-[#2a2a42] cursor-grab active:cursor-grabbing window-drag-handle shrink-0 select-none">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-emerald-400" />
          <span className="text-sm font-semibold text-white">Sensitivity Analysis</span>
          {results.length > 0 && <span className="text-xs text-gray-500 ml-1">Undiscounted Pit Value vs Harga Komoditas</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={runAnalysis} disabled={loading} className="p-1.5 rounded hover:bg-[#2a2a42] text-gray-400 hover:text-emerald-400 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onMinimize} className="p-1.5 rounded hover:bg-[#2a2a42] text-gray-400 hover:text-yellow-400 transition-colors">
            <Minus size={13} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-red-900/40 text-gray-400 hover:text-red-400 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
        {error && <div className="rounded-md bg-red-950/50 border border-red-800/60 px-3 py-2 text-red-300 text-xs">{error}</div>}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-emerald-400/80 text-sm animate-pulse text-center transition-all duration-300 min-h-[20px]">{LOADING_TEXTS[loadingStep]}</p>
          </div>
        )}
        {!loading && results.length === 0 && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <TrendingUp size={36} className="text-gray-600" />
            <p className="text-gray-400 text-sm">Upload Block Model lalu klik Refresh untuk melihat grafik sensitivitas.</p>
            <button onClick={runAnalysis} className="mt-2 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold transition-colors">Jalankan Analisis</button>
          </div>
        )}
        {!loading && results.length > 0 && (
          <>
            {baseResult && (
              <div className="grid grid-cols-3 gap-2 shrink-0">
                {[
                  { label: 'Undiscounted Pit Value Baseline', value: fmtCur(baseResult.total_npv), color: 'text-emerald-400' },
                  { label: 'Ore Tonnage', value: (baseResult.total_ore_tonnage/1e6).toFixed(2) + ' Mt', color: 'text-blue-400' },
                  { label: 'Strip Ratio', value: baseResult.stripping_ratio.toFixed(2), color: 'text-purple-400' },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#1e1e30] border border-[#2a2a42] rounded-md px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{stat.label}</p>
                    <p className={'text-sm font-bold mt-0.5 ' + stat.color}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 min-h-0 relative" id="sensitivity-chart-container">
              <Line ref={chartRef} data={chartData} options={chartOptions as any} />
            </div>
            <div className="shrink-0 overflow-x-auto max-h-32 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#12121f]">
                  <tr className="border-b border-[#2a2a42]">
                    {['Skenario','Harga/t','Undiscounted Pit Value','SR'].map(h => (
                      <th key={h} className="text-left text-gray-500 pb-1.5 pr-3 font-medium uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className={'border-b border-[#1e1e30] ' + (r.price_factor === 0 ? 'bg-emerald-950/20' : '')}>
                      <td className={'py-1.5 pr-3 font-medium ' + (r.price_factor === 0 ? 'text-emerald-400' : 'text-gray-300')}>{r.scenario}</td>
                      <td className="py-1.5 pr-3 text-gray-400">{r.commodity_price.toLocaleString('id-ID')}</td>
                      <td className={'py-1.5 pr-3 font-semibold ' + (r.total_npv >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtCur(r.total_npv)}</td>
                      <td className="py-1.5 text-gray-400">{r.stripping_ratio.toFixed(2)}</td>
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
