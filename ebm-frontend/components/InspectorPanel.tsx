'use client';

import { useEBMStore } from '../store/ebmStore';
import { Info, BoxSelect, DollarSign, CheckCircle2, Layers, AlertTriangle, FileText, Download } from 'lucide-react';
import React from 'react';
import exportCSVLib from '../lib/exportCSV';
import PitSelectionTable from './PitSelectionTable';

const fmt = (v: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v);

// exportPDF is now handled by lib/exportPDF.ts — called from TopToolbar




export default function InspectorPanel() {
  const {
    summary, selectedBlock, originX, originY, originZ,
    clippingZ, setClippingZ, clippingX, setClippingX, clippingY, setClippingY,
    utmZone, utmHemisphere, coordinateSystem, kmlMetadata, pitBoundaryPolygons,
    minZ, maxZ, minX, maxX, minY, maxY,
    pitBlocks, financialParams, viewMode, lithologyColors, showInspector, isStale,
    pitSelection, pitSelectionError,
  } = useEBMStore();

  if (!showInspector) return null;

  const currLabel = financialParams.currency || 'IDR';
  const gradeLabel = financialParams.grade_unit === 'g_per_t' ? 'g/t' : financialParams.grade_unit === 'percent' ? '%' : financialParams.grade_unit || 'g/t';
  const priceUnitLabel = financialParams.price_unit === 'per_gram' ? '/gram' : financialParams.price_unit === 'per_kg' ? '/kg' : financialParams.price_unit === 'per_troy_oz' ? '/oz' : '/t logam';

  const fmtId = (v: number, decimals: number = 2) =>
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: decimals }).format(v);

  const fmtCur = (v: number) => `${currLabel} ${fmtId(v, 0)}`;

  const minedBlocks = pitBlocks.filter((b) => b.MINED_STATUS === 1);
  const totalBlockCount = pitBlocks.length;
  const minedBlockCount = minedBlocks.length;

  // Calculate Pit Depth (elevation difference from mined blocks)
  let pitDepthStr = '-';
  if (minedBlocks.length > 0) {
    const zs = minedBlocks.map((b) => b.Z);
    const depth = Math.max(...zs) - Math.min(...zs) + (minedBlocks[0]?.DZ || 10);
    pitDepthStr = `${fmtId(depth, 1)} m`;
  }

  // Calculate Average Grade of Mined Ore
  let avgOreGradeStr = '-';
  const oreMinedBlocks = minedBlocks.filter((b) => b.Destination === 'Ore' || b.Model_Type === 'Ore');
  if (oreMinedBlocks.length > 0) {
    const totalTonnage = oreMinedBlocks.reduce((acc, b) => acc + (b.DX * b.DY * b.DZ * b.Density), 0);
    const weightedGradeSum = oreMinedBlocks.reduce(
      (acc, b) => acc + b.Grade * (b.DX * b.DY * b.DZ * b.Density),
      0
    );
    const avgGrade = totalTonnage > 0 ? weightedGradeSum / totalTonnage : 0;
    avgOreGradeStr = `${fmtId(avgGrade, 3)} ${gradeLabel}`;
  }

  const renderExecutiveMetrics = () => (
    <div className="p-4 space-y-5">
      {summary && (
        <div className="flex gap-2">
          <button onClick={async () => {
            const { default: exportPDF } = await import('../lib/exportPDF');
            exportPDF(summary, financialParams, pitBlocks, lithologyColors, pitSelection ?? undefined);
          }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-600/90 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg transition-colors">
            <FileText size={13} /> Ekspor PDF
          </button>
          <button onClick={() => exportCSVLib(pitBlocks, financialParams, (useEBMStore.getState() as any).csvFile?.name)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-700/80 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-lg transition-colors">
            <Download size={13} /> Ekspor CSV
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Executive Summary</h3>
          {isStale && summary && (
            <span className="text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle size={10} /> Hasil belum diperbarui
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="bg-[#1A1A24] p-3 rounded-md border border-[#2A2A3A]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 group/tooltip relative w-max">
                <div className="text-gray-400 text-xs">Total Undiscounted Pit Value</div>
                <Info size={11} className="text-gray-500 hover:text-gray-300 cursor-help" />
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-52 bg-gray-900 border border-gray-700 text-gray-200 text-[10px] p-2 rounded shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none text-center">
                  Estimasi akumulasi nilai ekonomi pit (undiscounted). Nilai ini tidak didiskon terhadap waktu (undiscounted cashflow).
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-700"></div>
                </div>
              </div>
              <span className="text-[9px] text-gray-500 italic">*nilai tidak didiskon</span>
            </div>
            <div className={`text-xl font-bold font-mono ${summary && (summary.total_undiscounted_value ?? summary.total_npv) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary ? fmtCur(summary.total_undiscounted_value ?? summary.total_npv) : '-'}
            </div>
          </div>
          
          <div className="bg-[#1A1A24] p-3 rounded-md border border-[#2A2A3A]">
            <div className="flex items-center gap-1.5 mb-1 group/tooltip relative w-max">
              <div className="text-gray-400 text-xs">Total Ore Mined</div>
              <Info size={11} className="text-gray-500 hover:text-gray-300 cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 bg-gray-900 border border-gray-700 text-gray-200 text-[10px] p-2 rounded shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none text-center">
                Total tonase batuan bijih yang akan diolah (sumber Revenue).
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-700"></div>
              </div>
            </div>
            <div className="text-lg font-mono text-[#F1F1F4]">{summary ? fmtId(summary.total_ore_tonnage) : '-'} <span className="text-xs text-gray-500">tonnes</span></div>
          </div>
          
          <div className="bg-[#1A1A24] p-3 rounded-md border border-[#2A2A3A]">
            <div className="flex items-center gap-1.5 mb-1 group/tooltip relative w-max">
              <div className="text-gray-400 text-xs">Total Waste Mined</div>
              <Info size={11} className="text-gray-500 hover:text-gray-300 cursor-help" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 bg-gray-900 border border-gray-700 text-gray-200 text-[10px] p-2 rounded shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none text-center">
                Total tonase batuan penutup yang harus dikupas (sumber Cost).
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-700"></div>
              </div>
            </div>
            <div className="text-lg font-mono text-[#F1F1F4]">{summary ? fmtId(summary.total_waste_tonnage) : '-'} <span className="text-xs text-gray-500">tonnes</span></div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#1A1A24] p-2.5 rounded-md border border-[#2A2A3A]">
              <div className="text-gray-400 text-[11px] mb-1">Stripping Ratio (W:O)</div>
              <div className="text-sm font-mono font-bold text-amber-300">{summary ? fmtId(summary.stripping_ratio, 2) : '-'}</div>
            </div>
            <div className="bg-[#1A1A24] p-2.5 rounded-md border border-[#2A2A3A]">
              <div className="text-gray-400 text-[11px] mb-1">Kedalaman Pit</div>
              <div className="text-sm font-mono font-bold text-cyan-300">{pitDepthStr}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#1A1A24] p-2.5 rounded-md border border-[#2A2A3A]">
              <div className="text-gray-400 text-[11px] mb-1">Kadar Rata-rata Bijih</div>
              <div className="text-sm font-mono font-bold text-yellow-400">{avgOreGradeStr}</div>
            </div>
            <div className="bg-[#1A1A24] p-2.5 rounded-md border border-[#2A2A3A]">
              <div className="text-gray-400 text-[11px] mb-1">Blok Tergali / Total</div>
              <div className="text-sm font-mono font-bold text-[#F1F1F4]">
                {totalBlockCount > 0 ? `${fmtId(minedBlockCount, 0)} / ${fmtId(totalBlockCount, 0)}` : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-[#222230]"></div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">3D Slicer / Cross-Section</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-[11px] text-gray-400 mb-1.5 font-mono">
              <span className="text-indigo-400 font-bold">Z (Elevasi)</span>
              <span>{clippingZ > 9990 ? 'No Clip' : fmt(clippingZ)}</span>
            </div>
            <input type="range" min={minZ} max={maxZ} value={clippingZ > 9990 ? maxZ : clippingZ}
              onChange={(e) => setClippingZ(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-[#222230] rounded-lg appearance-none cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1 font-mono"><span>{fmt(minZ)}</span><span>{fmt(maxZ)}</span></div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-gray-400 mb-1.5 font-mono">
              <span className="text-red-400 font-bold">X (Timur-Barat)</span>
              <span>{clippingX > 9990 ? 'No Clip' : fmt(clippingX)}</span>
            </div>
            <input type="range" min={minX} max={maxX} value={clippingX > 9990 ? maxX : clippingX}
              onChange={(e) => setClippingX(parseFloat(e.target.value))}
              className="w-full accent-red-500 h-1.5 bg-[#222230] rounded-lg appearance-none cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1 font-mono"><span>{fmt(minX)}</span><span>{fmt(maxX)}</span></div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-gray-400 mb-1.5 font-mono">
              <span className="text-emerald-400 font-bold">Y (Utara-Selatan)</span>
              <span>{clippingY > 9990 ? 'No Clip' : fmt(clippingY)}</span>
            </div>
            <input type="range" min={minY} max={maxY} value={clippingY > 9990 ? maxY : clippingY}
              onChange={(e) => setClippingY(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-[#222230] rounded-lg appearance-none cursor-pointer" />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1 font-mono"><span>{fmt(minY)}</span><span>{fmt(maxY)}</span></div>
          </div>
          <button onClick={() => { setClippingZ(9999); setClippingX(9999); setClippingY(9999); }}
            className="w-full text-[10px] text-gray-500 hover:text-white border border-[#2A2A3A] hover:border-gray-500 rounded-md py-1.5 transition-colors">
            Reset Semua Slicer
          </button>
        </div>
      </div>

      {(utmZone || kmlMetadata) && (
        <div>
          <div className="h-px bg-[#222230] my-2"></div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">KML / UTM Info</h3>
          <div className="bg-[#1A1A24] rounded-lg p-3 space-y-2 border border-[#2A2A3A]">
            {utmZone && <div className="flex justify-between text-xs"><span className="text-gray-500">Zona UTM:</span><span className="font-mono text-cyan-300 bg-cyan-900/20 px-1.5 py-0.5 rounded border border-cyan-700/30">UTM {utmZone}{utmHemisphere}</span></div>}
            {coordinateSystem && <div className="flex justify-between text-xs items-start gap-2"><span className="text-gray-500 shrink-0">Sistem:</span><span className="font-mono text-gray-400 text-right text-[10px]">{coordinateSystem}</span></div>}
            {kmlMetadata && <>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Titik Topo:</span><span className="font-mono text-gray-300">{kmlMetadata.topo_point_count.toLocaleString()}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Polygon Batas:</span><span className={`font-mono ${kmlMetadata.polygon_count > 0 ? 'text-amber-300' : 'text-gray-500'}`}>{kmlMetadata.polygon_count}</span></div>
            </>}
            {pitBoundaryPolygons.length > 0 && <div className="flex justify-between items-center text-xs pt-1 border-t border-[#2A2A3A]"><span className="text-gray-500">Status Batas:</span><span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">{pitBoundaryPolygons.length} polygon aktif</span></div>}
          </div>
        </div>
      )}

      {/* Pit Selection NPV Table */}
      {(pitSelection || pitSelectionError) && (
        <div>
          <div className="h-px bg-[#222230] my-2"></div>
          {pitSelectionError && (
            <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-[10px] text-red-400 font-mono mb-2">
              ⚠ Analisis NPV gagal: {pitSelectionError}
            </div>
          )}
          {pitSelection && (
            <PitSelectionTable
              pitSelection={pitSelection}
              currency={financialParams.currency || 'IDR'}
            />
          )}
        </div>
      )}
    </div>
  );

  const renderBlockInspector = () => {
    if (!selectedBlock) return null;
    const actualX = selectedBlock.X + originX;
    const actualY = selectedBlock.Y + originY;
    const actualZ = selectedBlock.Z + originZ;
    const volume = (selectedBlock.DX || 1) * (selectedBlock.DY || 1) * (selectedBlock.DZ || 1);

    return (
      <div className="p-4 space-y-6">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider"><BoxSelect size={14} className="text-pink-400" />Koordinat (UTM)</h3>
          <div className="bg-[#1A1A24] rounded-lg p-3 space-y-2 border border-[#2A2A3A]">
            <div className="flex justify-between text-sm"><span className="text-gray-500">X:</span><span className="font-mono text-gray-300">{fmtId(actualX, 2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Y:</span><span className="font-mono text-gray-300">{fmtId(actualY, 2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Z:</span><span className="font-mono text-gray-300">{fmtId(actualZ, 2)}</span></div>
          </div>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider"><Layers size={14} className="text-gray-400" />Properti</h3>
          <div className="bg-[#1A1A24] rounded-lg p-3 space-y-2 border border-[#2A2A3A]">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Kadar (Grade):</span><span className="font-mono text-yellow-400">{fmtId(selectedBlock.Grade, 3)} {gradeLabel}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Massa Jenis:</span><span className="font-mono text-gray-300">{fmtId(selectedBlock.Density, 2)} t/m³</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">RockType:</span><span className="font-mono text-gray-200">{selectedBlock.RockType}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Volume:</span><span className="font-mono text-gray-300">{fmtId(volume, 2)} m³</span></div>
          </div>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider"><DollarSign size={14} className="text-green-400" />Ekonomi</h3>
          <div className="bg-[#1A1A24] rounded-lg p-3 space-y-4 border border-[#2A2A3A]">
            <div className="flex justify-between items-center text-sm"><span className="text-gray-500">BEV:</span><span className={`font-mono font-bold text-lg ${selectedBlock.BEV >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtCur(selectedBlock.BEV)}</span></div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Status:</span>
              {selectedBlock.MINED_STATUS === 1
                ? <span className="flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-1 rounded text-xs font-bold border border-green-400/20"><CheckCircle2 size={12} /> DITAMBANG</span>
                : <span className="flex items-center gap-1 text-gray-400 bg-gray-500/10 px-2 py-1 rounded text-xs font-bold border border-gray-500/20"><AlertTriangle size={12} /> TIDAK DITAMBANG</span>}
            </div>
            {selectedBlock.MINED_STATUS === 1 && (
              <div className="flex justify-between items-center text-sm pt-2 border-t border-[#2A2A3A]">
                <span className="text-gray-500">Destinasi:</span>
                <span className={`font-mono px-2 py-0.5 rounded text-xs ${selectedBlock.Destination === 'Ore' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                  {selectedBlock.Destination === 'Ore' ? 'Pabrik (Ore)' : 'Dump (Waste)'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 bg-[#11111A] border-l border-[#222230] flex flex-col h-full overflow-hidden text-gray-200 shrink-0">
      <div className="p-4 border-b border-[#222230] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info size={18} className="text-indigo-400" />
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400">Inspector</h2>
        </div>
        {selectedBlock && (
          <button onClick={() => useEBMStore.getState().setSelectedBlock(null)} className="text-xs text-gray-500 hover:text-white bg-[#222230] px-2 py-1 rounded">Clear</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {selectedBlock ? renderBlockInspector() : renderExecutiveMetrics()}
      </div>
    </div>
  );
}
