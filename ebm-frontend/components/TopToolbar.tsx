'use client';

import { useRef, useState } from 'react';
import { useEBMStore } from '../store/ebmStore';
import { 
  Pickaxe, ChevronDown, FolderOpen, Save, Eye, EyeOff, BarChart2, 
  FilePlus, FileDown, Box, CheckCircle2, FileText,
  Server, RefreshCw, Check, AlertCircle, X
} from 'lucide-react';

export default function TopToolbar() {
  const { 
    runOptimization, isLoading, downloadWorkspace, loadWorkspace,
    showCanvas, showInspector, showSensitivity,
    setShowCanvas, setShowInspector, setShowSensitivity,
    showWorkspaceModal, setShowWorkspaceModal,
    isNestedPitWindowOpen, setIsNestedPitWindowOpen, nestedPits,
    summary, financialParams, pitBlocks, lithologyColors,
    activeTab, setActiveTab,
    apiUrl, setApiUrl
  } = useEBMStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  // API Server Settings Modal
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  const handleOpenApiModal = () => {
    setTempUrl(apiUrl || 'http://127.0.0.1:8001');
    setTestResult({ status: 'idle' });
    setApiModalOpen(true);
  };

  const handleTestConnection = async (targetUrl: string) => {
    setTestResult({ status: 'testing' });
    const clean = targetUrl.trim().replace(/\/+$/, '');
    try {
      const res = await fetch(`${clean}/health`, { method: 'GET' }).catch(() => null);
      if (res && (res.ok || res.status === 200 || res.status === 404)) {
        setTestResult({ status: 'success', message: `Server terhubung! (HTTP ${res.status})` });
        return;
      }
      const docRes = await fetch(`${clean}/docs`, { method: 'GET' }).catch(() => null);
      if (docRes && docRes.ok) {
        setTestResult({ status: 'success', message: 'Server terhubung! (Dokumentasi FastAPI aktif)' });
      } else {
        setTestResult({ status: 'error', message: 'Gagal terhubung. Pastikan server backend / tunnel sedang berjalan.' });
      }
    } catch (e: any) {
      setTestResult({ status: 'error', message: `Gagal: ${e.message || 'Network unreachable'}` });
    }
  };

  const handleSaveApiUrl = () => {
    const clean = tempUrl.trim().replace(/\/+$/, '');
    if (clean) {
      setApiUrl(clean);
    }
    setApiModalOpen(false);
  };

  const handleResetLocalhost = () => {
    const local = 'http://127.0.0.1:8001';
    setTempUrl(local);
    handleTestConnection(local);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      loadWorkspace(content);
      setFileMenuOpen(false);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-14 bg-[#11111A] border-b border-[#222230] flex items-center justify-between px-6 shrink-0 z-30">
      <div className="flex items-center gap-6">
        <h1 className="text-blue-400 font-bold text-lg tracking-wide">EBM Engine</h1>
        
        {/* Desktop-like Menu Bar */}
        <div className="flex items-center gap-2 relative">
          <button 
            onClick={() => { setFileMenuOpen(!fileMenuOpen); setViewMenuOpen(false); }}
            className="text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors"
          >
            File <ChevronDown size={14} />
          </button>
          
          {fileMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-[#1e1e2d] border border-gray-700 rounded-md shadow-xl py-1 z-50">
              <button 
                onClick={() => { setShowWorkspaceModal(true); setFileMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
              >
                <FilePlus size={14} /> New Workspace
              </button>
              <button 
                onClick={() => { setShowWorkspaceModal(true); setFileMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
              >
                <FolderOpen size={14} /> Load Workspace
              </button>
              <button 
                onClick={() => { downloadWorkspace(); setFileMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
              >
                <Save size={14} /> Save Workspace
              </button>
              <div className="border-t border-gray-700 my-1"></div>
              <button 
                onClick={() => { fileInputRef.current?.click(); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
              >
                <FileDown size={14} /> Import File (.ebm)
              </button>
            </div>
          )}

          <button 
            onClick={() => { setViewMenuOpen(!viewMenuOpen); setFileMenuOpen(false); }}
            className="text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors"
          >
            View <ChevronDown size={14} />
          </button>

          {viewMenuOpen && (
            <div className="absolute top-full left-16 mt-1 w-56 bg-[#1e1e2d] border border-gray-700 rounded-md shadow-xl py-1 z-50">
              <button 
                onClick={() => { setShowInspector(!showInspector); setViewMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 justify-between"
              >
                <span>Project Explorer</span>
                {showInspector ? <CheckCircle2 size={14} className="text-green-400" /> : null}
              </button>
              <button 
                onClick={() => { setShowCanvas(!showCanvas); setViewMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 justify-between"
              >
                <span>3D Viewport</span>
                {showCanvas ? <CheckCircle2 size={14} className="text-green-400" /> : null}
              </button>
              <div className="border-t border-gray-700 my-1"></div>
              <button 
                onClick={() => { setShowSensitivity(!showSensitivity); setViewMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 justify-between"
              >
                <div className="flex items-center gap-2">
                  <BarChart2 size={14} /> Sensitivity Graph
                </div>
              </button>
              <button 
                onClick={() => { setIsNestedPitWindowOpen(!isNestedPitWindowOpen); setViewMenuOpen(false); }}
                disabled={nestedPits.length === 0}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 justify-between ${
                  nestedPits.length === 0 
                    ? 'text-gray-600 cursor-not-allowed' 
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
                title={nestedPits.length === 0 ? "Jalankan optimasi terlebih dahulu" : ""}
              >
                <div className="flex items-center gap-2">
                  <BarChart2 size={14} /> Nested Pit Analysis
                </div>
                {nestedPits.length > 0 && (
                  isNestedPitWindowOpen ? <Eye size={14} className="text-green-400"/> : <EyeOff size={14} className="text-red-400"/>
                )}
              </button>
            </div>
          )}
        </div>
        
        <input 
          type="file"  
          accept=".ebm,.json" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileUpload} 
        />
      </div>

      {/* Primary Tab Switcher */}
      <div className="flex items-center bg-[#0B0B14] p-1 rounded-xl border border-[#232334] gap-1 shadow-inner">
        <button
          onClick={() => setActiveTab('workspace')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'workspace'
              ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1A1A28] border border-transparent'
          }`}
        >
          <Box size={14} className={activeTab === 'workspace' ? 'text-blue-400' : 'text-gray-400'} />
          <span>3D Workspace</span>
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'report'
              ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1A1A28] border border-transparent'
          }`}
        >
          <FileText size={14} className={activeTab === 'report' ? 'text-indigo-400' : 'text-gray-400'} />
          <span>Executive Report & Analytics</span>
          {summary && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* API Server Button & Indicator */}
        <button
          onClick={handleOpenApiModal}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono bg-[#181826] hover:bg-[#222236] border border-[#2a2a40] text-gray-300 transition-colors"
          title="Pengaturan URL Server Backend API"
        >
          <Server size={14} className="text-blue-400" />
          <span className="hidden md:inline max-w-[130px] truncate text-[11px] text-gray-400">
            {apiUrl ? apiUrl.replace(/^https?:\/\//, '') : '127.0.0.1:8001'}
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
        </button>

        {/* Run Button */}
        <button 
          onClick={runOptimization}
          disabled={isLoading}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
            isLoading 
              ? 'bg-blue-900/50 text-blue-400 cursor-not-allowed'
              : 'bg-[#00ff66] hover:bg-[#00cc55] text-gray-900 shadow-[0_0_15px_rgba(0,255,102,0.3)] cursor-pointer'
          }`}
        >
          <Pickaxe size={16} className={isLoading ? 'animate-bounce' : ''} />
          {isLoading ? 'Memproses...' : 'Run'}
        </button>
      </div>

      {/* API Server Settings Modal */}
      {apiModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141420] border border-[#28283c] rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222232] bg-[#181828]">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-gray-200">Konfigurasi Server Backend API</h3>
              </div>
              <button 
                onClick={() => setApiModalOpen(false)}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-gray-400 leading-relaxed">
                Tentukan endpoint URL backend FastAPI yang memproses optimasi pit dan data blok:
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  API Base URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8001"
                    className="flex-1 bg-[#0c0c14] border border-[#2e2e44] focus:border-blue-500 rounded-lg px-3 py-2 text-gray-200 font-mono text-xs focus:outline-none"
                  />
                  <button
                    onClick={() => handleTestConnection(tempUrl)}
                    disabled={testResult.status === 'testing'}
                    className="px-3 py-2 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 font-medium transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    {testResult.status === 'testing' ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    <span>Tes</span>
                  </button>
                </div>
              </div>

              {/* Status Message */}
              {testResult.status === 'success' && (
                <div className="flex items-center gap-2 text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-3 py-2">
                  <Check size={14} />
                  <span>{testResult.message}</span>
                </div>
              )}
              {testResult.status === 'error' && (
                <div className="flex items-center gap-2 text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
                  <AlertCircle size={14} />
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                  Preset Cepat
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={handleResetLocalhost}
                    className="flex items-center justify-between text-left px-3 py-2 rounded-lg bg-[#1a1a2c] hover:bg-[#22223a] border border-[#2c2c42] text-gray-300 transition-colors"
                  >
                    <span className="font-mono text-blue-300">Localhost (http://127.0.0.1:8001)</span>
                    <span className="text-[10px] text-gray-500">Default Lokal</span>
                  </button>
                  <button
                    onClick={() => {
                      const tunnel = 'https://promising-cards-hong-computer.trycloudflare.com';
                      setTempUrl(tunnel);
                      handleTestConnection(tunnel);
                    }}
                    className="flex items-center justify-between text-left px-3 py-2 rounded-lg bg-[#1a1a2c] hover:bg-[#22223a] border border-[#2c2c42] text-gray-300 transition-colors"
                  >
                    <span className="font-mono text-amber-300 truncate max-w-[260px]">
                      promising-cards...trycloudflare.com
                    </span>
                    <span className="text-[10px] text-gray-500">Cloudflare Tunnel</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#222232] bg-[#181828]">
              <button
                onClick={() => setApiModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveApiUrl}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Simpan & Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
