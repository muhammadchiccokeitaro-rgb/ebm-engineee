'use client';

import { useRef } from 'react';
import { useEBMStore } from '../store/ebmStore';
import { X, FolderOpen, Plus, Save, FileDown } from 'lucide-react';

interface WorkspaceModalProps {
  onClose: () => void;
}

const projectTemplates = [
  { id: 'gold', name: 'Emas', desc: 'CONTOH DEMO - isi dengan harga terkini (Satuan: g/t & Rp/gram)', icon: '🥇', color: 'from-yellow-700 to-yellow-500' },
  { id: 'nickel', name: 'Nikel Laterit', desc: 'CONTOH DEMO - isi dengan harga terkini (Satuan: % & USD/t metal)', icon: '🔩', color: 'from-green-800 to-green-600' },
  { id: 'copper', name: 'Tembaga', desc: 'CONTOH DEMO - isi dengan harga terkini (Satuan: % & USD/t metal)', icon: '⛏️', color: 'from-amber-800 to-amber-600' },
];

const defaultParams: Record<string, any> = {
  gold: {
    commodity_price: 1000000,
    ore_mining_cost: 45000,
    waste_mining_cost: 25000,
    processing_cost: 150000,
    selling_cost: 20000,
    metallurgical_recovery: 0.90,
    osa: 45,
    cut_off_grade: 0.5,
    grade_unit: 'g_per_t',
    price_unit: 'per_gram',
    currency: 'IDR'
  },
  nickel: {
    commodity_price: 16000,
    ore_mining_cost: 5.0,
    waste_mining_cost: 3.0,
    processing_cost: 25.0,
    selling_cost: 4.0,
    metallurgical_recovery: 0.85,
    osa: 45,
    cut_off_grade: 1.2,
    grade_unit: 'percent',
    price_unit: 'per_t_metal',
    currency: 'USD'
  },
  copper: {
    commodity_price: 9000,
    ore_mining_cost: 3.5,
    waste_mining_cost: 2.0,
    processing_cost: 15.0,
    selling_cost: 5.0,
    metallurgical_recovery: 0.88,
    osa: 45,
    cut_off_grade: 0.3,
    grade_unit: 'percent',
    price_unit: 'per_t_metal',
    currency: 'USD'
  },
};

export default function WorkspaceModal({ onClose }: WorkspaceModalProps) {
  const { downloadWorkspace, loadWorkspace } = useEBMStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadTemplate = (id: string) => {
    const params = defaultParams[id];
    if (!params) return;
    const workspaceData = { financialParams: params, lithologyColors: {}, viewMode: 'Grade Heatmap', layerVisibility: { blockModel: true, pitShell: true, pitShellWireframe: true, topography: true, wasteBlocks: true, pitBoundary: true } };
    loadWorkspace(JSON.stringify(workspaceData));
    onClose();
  };

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      loadWorkspace(ev.target?.result as string);
      onClose();
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-[#12121f] border border-[#2a2a42] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a42]">
          <div>
            <h2 className="text-white font-bold text-base">Workspace Manager</h2>
            <p className="text-gray-500 text-xs mt-0.5">Pilih template atau muat workspace yang sudah ada</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#2a2a42] text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-6">
          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1e1e30] border border-[#3a3a52] rounded-lg text-gray-300 hover:text-white hover:border-blue-500 text-sm transition-all"
            >
              <FolderOpen size={15} /> Load dari File (.ebm/.json)
            </button>
            <button
              onClick={() => { downloadWorkspace(); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1e1e30] border border-[#3a3a52] rounded-lg text-gray-300 hover:text-white hover:border-emerald-500 text-sm transition-all"
            >
              <Save size={15} /> Save Workspace Saat Ini
            </button>
            <input ref={fileInputRef} type="file" accept=".ebm,.json" style={{ display: 'none' }} onChange={handleFileLoad} />
          </div>

          {/* Separator */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#2a2a42]" />
            <span className="text-gray-600 text-xs uppercase tracking-wide">atau mulai dari template</span>
            <div className="flex-1 h-px bg-[#2a2a42]" />
          </div>

          {/* Template tiles */}
          <div className="grid grid-cols-2 gap-3">
            {projectTemplates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => handleLoadTemplate(tpl.id)}
                className="group relative flex flex-col items-start gap-2 p-4 rounded-xl border border-[#2a2a42] hover:border-[#4a4a62] bg-[#1a1a2c] hover:bg-[#1e1e38] transition-all text-left overflow-hidden"
              >
                <div className={'absolute inset-0 bg-gradient-to-br ' + tpl.color + ' opacity-0 group-hover:opacity-10 transition-opacity'} />
                <div className="flex items-center gap-3 w-full">
                  <span className="text-2xl">{tpl.icon}</span>
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{tpl.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{tpl.desc}</p>
                  </div>
                  <Plus size={14} className="text-gray-600 group-hover:text-white transition-colors shrink-0" />
                </div>
                <div className="flex gap-2 flex-wrap mt-1">
                  {Object.entries(defaultParams[tpl.id]).slice(0,3).map(([k,v]) => (
                    <span key={k} className="text-[10px] bg-[#2a2a42] text-gray-400 px-2 py-0.5 rounded">
                      {k.split('_').pop()?.toUpperCase()}: {typeof v === 'number' ? (v as number).toLocaleString('id-ID') : String(v)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
