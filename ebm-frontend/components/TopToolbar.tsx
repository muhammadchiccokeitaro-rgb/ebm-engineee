'use client';

import { useRef, useState } from 'react';
import { useEBMStore } from '../store/ebmStore';
import { Pickaxe, ChevronDown, FolderOpen, Save, Eye, EyeOff, BarChart2, FilePlus, FileDown, LogOut, Box, CheckCircle2, FileText } from 'lucide-react';

export default function TopToolbar() {
  const { 
    runOptimization, isLoading, downloadWorkspace, loadWorkspace,
    showCanvas, showInspector, showSensitivity,
    setShowCanvas, setShowInspector, setShowSensitivity,
    showWorkspaceModal, setShowWorkspaceModal,
    isNestedPitWindowOpen, setIsNestedPitWindowOpen, nestedPits,
    summary, financialParams, pitBlocks, lithologyColors,
    activeTab, setActiveTab
  } = useEBMStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

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
              <div className="h-px bg-gray-700 my-1" />
              <button 
                onClick={async () => {
                  if (!summary) { alert('Jalankan optimasi terlebih dahulu.'); return; }
                  const { default: exportPDF } = await import('../lib/exportPDF');
                  exportPDF(summary, financialParams, pitBlocks, lithologyColors);
                  setFileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
              >
                <FileDown size={14} /> Export PDF Report
              </button>
              <div className="h-px bg-gray-700 my-1" />
              <button 
                onClick={() => window.close()}
                className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
              >
                <LogOut size={14} /> Exit
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 relative ml-1">
          <button 
            onClick={() => { setViewMenuOpen(!viewMenuOpen); setFileMenuOpen(false); }}
            className="text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors"
          >
            View <ChevronDown size={14} />
          </button>
          
          {viewMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-[#1e1e2d] border border-gray-700 rounded-md shadow-xl py-1 z-50">
              <button 
                onClick={() => { setActiveTab('workspace'); setViewMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 justify-between"
              >
                <div className="flex items-center gap-2">
                  <Box size={14} /> 3D Workspace
                </div>
                {activeTab === 'workspace' && <CheckCircle2 size={13} className="text-blue-400" />}
              </button>
              <button 
                onClick={() => { setActiveTab('report'); setViewMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 justify-between"
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} /> Executive Report & Analytics
                </div>
                {activeTab === 'report' && <CheckCircle2 size={13} className="text-indigo-400" />}
              </button>
              <div className="h-px bg-gray-700 my-1"></div>
              <button 
                onClick={() => { setShowCanvas(!showCanvas); setViewMenuOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 justify-between"
              >
                <span>3D Canvas</span>
                {showCanvas ? <Eye size={14} className="text-green-400"/> : <EyeOff size={14} className="text-red-400"/>}
              </button>
              <div className="h-px bg-gray-700 my-1"></div>
              <button 
                onClick={() => { setShowSensitivity(true); setViewMenuOpen(false); }}
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

      <div className="flex items-center gap-4">
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
    </div>
  );
}
