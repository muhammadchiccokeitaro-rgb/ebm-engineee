'use client';

import { useEBMStore, FinancialParams } from '../store/ebmStore';
import NumericInput from './NumericInput';
import {
  Eye,
  EyeOff,
  Upload,
  FolderTree,
  SlidersHorizontal,
  Map,
  Cuboid,
  Mountain,
  Box,
  Globe,
  TriangleAlert,
  ChevronDown,
  ChevronRight,
  Pickaxe,
  Palette,
  AlertCircle,
  FileSpreadsheet,
  Network,
} from 'lucide-react';
import React, { useRef, useState } from 'react';

export default function ProjectExplorer() {
  const {
    layerVisibility,
    setLayerVisibility,
    setCsvFile,
    setTopographyFile,
    financialParams,
    setFinancialParam,
    csvFile,
    topographyFile,
    utmZone,
    utmHemisphere,
    coordinateSystem,
    kmlMetadata,
    processKmzAsPitBoundary,
    isLoading,
    lithologies,
    lithologyColors,
    setLithologyColor,
    runOptimization,
    geonEnabled,
    geonMapping,
    setGeonEnabled,
    setGeonMapping,
  } = useEBMStore();

  const csvInputRef = useRef<HTMLInputElement>(null);
  const topoInputRef = useRef<HTMLInputElement>(null);

  // Collapsible steps state (Step 2 open by default)
  const [step1Open, setStep1Open] = useState(false);
  const [step2Open, setStep2Open] = useState(true);
  const [step3Open, setStep3Open] = useState(false);

  // Notification when unit changes
  const [unitWarning, setUnitWarning] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'block' | 'topo') => {
    if (e.target.files && e.target.files.length > 0) {
      if (type === 'block') setCsvFile(e.target.files[0]);
      if (type === 'topo') setTopographyFile(e.target.files[0]);
    }
  };

  const handleUnitChange = (key: 'grade_unit' | 'price_unit', value: any) => {
    setFinancialParam(key, value);
    setUnitWarning('Peringatan: Angka parameter tidak otomatis dikonversi. Sesuaikan nilai angka dengan satuan baru.');
    setTimeout(() => {
      setUnitWarning(null);
    }, 6000);
  };

  const renderLayerItem = ({
    id,
    label,
    icon: Icon,
    hasUpload = false,
    uploadType,
    file,
  }: {
    id: 'blockModel' | 'pitShell' | 'pitShellWireframe' | 'topography' | 'wasteBlocks' | 'pitBoundary';
    label: string;
    icon: React.FC<{ size?: number; className?: string }>;
    hasUpload?: boolean;
    uploadType?: 'block' | 'topo';
    file?: File | null;
  }) => {
    const isVisible = layerVisibility[id];

    return (
      <div key={`${id}-${label}`} className="flex items-center justify-between group hover:bg-[#1E1E2D] p-2 rounded-md transition-colors text-xs">
        <div className="flex items-center gap-2.5 text-[#D1D1DB] min-w-0">
          <Icon size={14} className="text-gray-500 group-hover:text-blue-400 transition-colors shrink-0" />
          <span className="font-medium truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasUpload && (
            <button
              onClick={() => {
                if (uploadType === 'block') csvInputRef.current?.click();
                else if (uploadType === 'topo') topoInputRef.current?.click();
              }}
              className="text-gray-500 hover:text-blue-400 p-1 transition-colors"
              title="Upload File"
            >
              <Upload size={13} />
            </button>
          )}
          <button
            onClick={() => setLayerVisibility(id, !isVisible)}
            className={`${isVisible ? 'text-blue-400' : 'text-gray-600'} hover:text-white p-1 transition-colors`}
          >
            {isVisible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        </div>
      </div>
    );
  };

  const curr = financialParams.currency || 'IDR';
  const priceUnit = financialParams.price_unit || 'per_gram';
  const priceSuffix = ` ${curr}/${priceUnit === 'per_gram' ? 'gram' : priceUnit === 'per_kg' ? 'kg' : priceUnit === 'per_troy_oz' ? 'oz' : 't logam'}`;
  const costSuffix = ` ${curr}/t`;
  const gradeSuffix = ` ${financialParams.grade_unit === 'g_per_t' ? 'g/t' : financialParams.grade_unit === 'percent' ? '%' : financialParams.grade_unit || 'g/t'}`;

  return (
    <div className="w-80 bg-[#11111A] border-r border-[#222230] flex flex-col h-full overflow-hidden text-gray-200 shrink-0 select-none">
      {/* Header */}
      <div className="p-3.5 border-b border-[#222230] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderTree size={16} className="text-blue-400" />
          <h2 className="font-bold text-xs uppercase tracking-wider text-gray-300">Konfigurasi Pit Limit</h2>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input type="file" accept=".csv" className="hidden" ref={csvInputRef} onChange={(e) => handleFileChange(e, 'block')} />
      <input type="file" accept=".tif,.tiff,.csv,.xyz,.kml,.kmz" className="hidden" ref={topoInputRef} onChange={(e) => handleFileChange(e, 'topo')} />

      {/* Collapsible Steps Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {/* Unit Change Warning Banner */}
        {unitWarning && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-2.5 flex items-start gap-2 text-amber-300 text-[11px] leading-tight animate-in fade-in">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-400" />
            <span>{unitWarning}</span>
          </div>
        )}

        {/* SECTION 1: DATA & LAPISAN */}
        <div className="border border-[#232338] bg-[#12121e] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setStep1Open(!step1Open)}
            className="w-full px-3.5 py-3 flex items-center justify-between bg-[#161626] hover:bg-[#1c1c30] transition-colors text-left btn-tactile"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-blue-950/60 text-blue-400 border border-blue-800/40 flex items-center justify-center">
                <FileSpreadsheet size={13} />
              </div>
              <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">Data Model & Topografi</span>
            </div>
            <div className="flex items-center gap-2">
              {csvFile && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
                  Model Siap
                </span>
              )}
              {step1Open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            </div>
          </button>

          {step1Open && (
            <div className="p-3 space-y-2">
              {/* CSV Block Model item */}
              <div className="bg-[#1A1A26] p-2.5 rounded border border-[#2A2A3A]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-300">
                    <FileSpreadsheet size={14} className="text-blue-400" />
                    <span className="font-semibold">Model Blok (CSV)</span>
                  </div>
                  <button
                    onClick={() => csvInputRef.current?.click()}
                    className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded font-medium transition-colors flex items-center gap-1"
                  >
                    <Upload size={11} /> {csvFile ? 'Ganti File' : 'Upload'}
                  </button>
                </div>
                {csvFile ? (
                  <div className="text-[11px] font-mono text-emerald-400 truncate bg-emerald-950/20 px-2 py-1 rounded border border-emerald-800/30">
                    ✓ {csvFile.name}
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-500 italic">Belum ada file model blok yang diunggah</div>
                )}
              </div>

              {/* Topography item */}
              <div className="bg-[#1A1A26] p-2.5 rounded border border-[#2A2A3A]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-300">
                    <Map size={14} className="text-cyan-400" />
                    <span className="font-semibold">Topografi / Batas Pit (KMZ/KML)</span>
                  </div>
                  <button
                    onClick={() => topoInputRef.current?.click()}
                    className="text-[11px] bg-[#2A2A3E] hover:bg-[#3A3A52] text-gray-300 hover:text-white px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                  >
                    <Upload size={11} /> {topographyFile ? 'Ganti' : 'Upload'}
                  </button>
                </div>
                {topographyFile ? (
                  <div className="space-y-1">
                    <div className="text-[11px] font-mono text-cyan-300 truncate bg-cyan-950/20 px-2 py-1 rounded border border-cyan-800/30">
                      ✓ {topographyFile.name}
                    </div>
                    {utmZone && (
                      <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-mono">
                        <Globe size={10} /> UTM Zone {utmZone}{utmHemisphere}
                      </div>
                    )}
                    {topographyFile && (topographyFile.name.endsWith('.kmz') || topographyFile.name.endsWith('.kml')) && (
                      <button
                        onClick={() => processKmzAsPitBoundary()}
                        disabled={isLoading}
                        className="w-full mt-1 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 py-1 rounded transition-colors"
                      >
                        Jadikan Polygon Batas Pit
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-500 italic">Opsional (format .xyz, .csv, .tif, .kmz, .kml)</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: PARAMETER FINANSIAL & TEKNIK */}
        <div className="border border-[#232338] bg-[#12121e] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setStep2Open(!step2Open)}
            className="w-full px-3.5 py-3 flex items-center justify-between bg-[#161626] hover:bg-[#1c1c30] transition-colors text-left btn-tactile"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-amber-950/60 text-amber-400 border border-amber-800/40 flex items-center justify-center">
                <SlidersHorizontal size={13} />
              </div>
              <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">Parameter Ekonomi & Lereng</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-800/40">
                {financialParams.currency || 'IDR'}
              </span>
              {step2Open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            </div>
          </button>

          {step2Open && (
            <div className="p-3 space-y-2">
              {/* Unit selectors */}
              <div className="bg-[#0d0d18] p-3 rounded-lg border border-[#232338] space-y-2.5 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-[#9E9EA8]">Mata Uang</label>
                  <input
                    type="text"
                    value={financialParams.currency || 'IDR'}
                    onChange={(e) => setFinancialParam('currency', e.target.value.toUpperCase())}
                    className="w-36 bg-[#090912] text-[#F1F1F4] font-mono text-xs border border-[#232338] rounded-md px-2.5 py-1.5 text-right focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-[#9E9EA8]">Satuan Kadar</label>
                  <select
                    value={financialParams.grade_unit || 'g_per_t'}
                    onChange={(e) => handleUnitChange('grade_unit', e.target.value)}
                    className="w-36 bg-[#090912] text-[#F1F1F4] font-mono text-xs border border-[#232338] rounded-md px-2 py-1.5 text-right focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 cursor-pointer"
                  >
                    <option value="g_per_t">g/t (gram/ton)</option>
                    <option value="percent">% (persen)</option>
                    <option value="fraction">fraction (fraksi)</option>
                    <option value="ppm">ppm</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-[#9E9EA8]">Satuan Harga</label>
                  <select
                    value={financialParams.price_unit || 'per_gram'}
                    onChange={(e) => handleUnitChange('price_unit', e.target.value)}
                    className="w-36 bg-[#090912] text-[#F1F1F4] font-mono text-xs border border-[#232338] rounded-md px-2 py-1.5 text-right focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 cursor-pointer"
                  >
                    <option value="per_gram">/gram</option>
                    <option value="per_kg">/kg</option>
                    <option value="per_t_metal">/t logam</option>
                    <option value="per_troy_oz">/oz (troy oz)</option>
                  </select>
                </div>
              </div>

              {/* Economic Inputs */}
              <NumericInput
                label="Harga Komoditas"
                value={financialParams.commodity_price}
                unit={priceSuffix}
                min={0}
                tooltip="Harga jual komoditas di pasar per satuan berat produk."
                onChange={(val) => setFinancialParam('commodity_price', val)}
              />

              <NumericInput
                label="Biaya Tambang Ore"
                value={financialParams.ore_mining_cost}
                unit={costSuffix}
                min={0}
                tooltip="Biaya operasional penggalian & pemuatan batuan bijih ke pabrik pengolahan."
                onChange={(val) => setFinancialParam('ore_mining_cost', val)}
              />

              <NumericInput
                label="Biaya Tambang Waste"
                value={financialParams.waste_mining_cost}
                unit={costSuffix}
                min={0}
                tooltip="Biaya operasional pengupasan batuan penutup (overburden) ke area disposal."
                onChange={(val) => setFinancialParam('waste_mining_cost', val)}
              />

              <NumericInput
                label="Biaya Pengolahan"
                value={financialParams.processing_cost}
                unit={costSuffix}
                min={0}
                tooltip="Biaya ekstraksi metalurgi dan pemrosesan konsentrat/produk di pabrik."
                onChange={(val) => setFinancialParam('processing_cost', val)}
              />

              <NumericInput
                label="Biaya Penjualan"
                value={financialParams.selling_cost}
                unit={costSuffix}
                min={0}
                tooltip="Biaya pasca-produksi meliputi royalti, pengapalan, pemurnian, dan G&A."
                onChange={(val) => setFinancialParam('selling_cost', val)}
              />

              <NumericInput
                label="Recovery Metalurgi"
                value={financialParams.metallurgical_recovery}
                unit=" [0-1]"
                min={0}
                max={1}
                tooltip="Faktor perolehan metalurgi pabrik (rentang fraksi 0.0 hingga 1.0)."
                onChange={(val) => setFinancialParam('metallurgical_recovery', val)}
              />

              {/* ─── SLOPE / GEON PANEL ─── */}
              <div className="bg-[#1A1A26] p-2.5 rounded border border-[#2A2A3A] space-y-2">
                {/* Header row with toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                    <Network size={13} className="text-violet-400" />
                    <span>Sudut Lereng</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none group">
                    <span className="text-[11px] text-gray-500 group-hover:text-gray-300 transition-colors">
                      {geonEnabled ? 'GEON Aktif' : 'Global'}
                    </span>
                    <div
                      onClick={() => {
                        const next = !geonEnabled;
                        setGeonEnabled(next);
                        // When first activating GEON, seed from lithologies with current OSA
                        if (next && lithologies.length > 0) {
                          const seeded: Record<string, number> = {};
                          lithologies.forEach((l) => {
                            seeded[l] = geonMapping[l] ?? financialParams.osa;
                          });
                          setGeonMapping(seeded);
                        }
                      }}
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                        geonEnabled ? 'bg-violet-600' : 'bg-[#2A2A3A]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          geonEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </label>
                </div>

                {!geonEnabled ? (
                  /* ── Global OSA ── */
                  <NumericInput
                    label="OSA Global"
                    value={financialParams.osa}
                    unit=" °"
                    min={1}
                    max={89}
                    tooltip="Overall Slope Angle tunggal untuk seluruh model blok."
                    onChange={(val) => setFinancialParam('osa', val)}
                  />
                ) : (
                  /* ── GEON: tabel per-RockType ── */
                  <div className="space-y-1.5">
                    {lithologies.length === 0 ? (
                      <p className="text-[11px] text-amber-400 italic">
                        Upload & jalankan optimasi dulu agar RockType terdeteksi.
                      </p>
                    ) : (
                      lithologies.map((litho) => (
                        <div key={litho} className="flex items-center justify-between gap-2">
                          <span
                            className="text-[11px] text-gray-300 font-mono truncate max-w-[120px]"
                            title={litho}
                          >
                            {litho}
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              max={89}
                              step={1}
                              value={geonMapping[litho] ?? financialParams.osa}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) {
                                  setGeonMapping({ ...geonMapping, [litho]: v });
                                }
                              }}
                              className="w-14 bg-[#12121C] text-[#F1F1F4] font-mono text-xs border border-[#2A2A3A] rounded px-2 py-0.5 text-right focus:outline-none focus:border-violet-500"
                            />
                            <span className="text-[11px] text-gray-500">°</span>
                          </div>
                        </div>
                      ))
                    )}
                    <p className="text-[10px] text-gray-600 italic pt-1">
                      Gigi 2 aktif — setiap domain menggunakan OSA-nya sendiri.
                    </p>
                  </div>
                )}
              </div>

              <NumericInput
                label="Cut-off Grade"
                value={financialParams.cut_off_grade}
                unit={gradeSuffix}
                min={0}
                tooltip="Batas kadar marjinal minimum agar batuan bernilai ekonomis diproses sebagai Ore."
                onChange={(val) => setFinancialParam('cut_off_grade', val)}
              />

              {/* ─── ANALISIS NPV INDIKATIF (opsional) ─── */}
              <div className="bg-[#1A1A26] p-2.5 rounded border border-[#2A2A3A] space-y-2 mt-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 mb-1">
                  <span className="text-amber-400 font-mono text-[10px] border border-amber-700/40 bg-amber-900/20 px-1.5 py-0.5 rounded uppercase tracking-wider">NPV</span>
                  <span>Analisis NPV Indikatif</span>
                  <span className="text-[10px] text-gray-600 font-normal">(opsional)</span>
                </div>
                <div className="text-[10px] text-gray-600 italic leading-snug mb-1">
                  Isi kapasitas produksi untuk mengaktifkan. Hasilnya indikatif, bukan jadwal operasional.
                </div>
                {/* Kapasitas Produksi — nullable: kosong = nonaktif */}
                <div className="mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs text-[#9E9EA8]">Kapasitas produksi</label>
                    <div className="flex items-center w-36 bg-[#0d0d18] border border-[#232338] hover:border-[#383854] focus-within:border-blue-500/80 focus-within:ring-1 focus-within:ring-blue-500/30 rounded-md px-2.5 py-1.5 transition-all">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="—"
                        value={
                          financialParams.production_capacity_tpy != null && financialParams.production_capacity_tpy > 0
                            ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(financialParams.production_capacity_tpy)
                            : ''
                        }
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                          const num = parseFloat(raw);
                          setFinancialParam('production_capacity_tpy', isNaN(num) || num <= 0 ? null : num);
                        }}
                        className="w-full bg-transparent text-[#F1F1F4] font-mono text-xs text-right focus:outline-none placeholder-gray-600"
                      />
                      <span className="text-[10px] font-mono text-[#78788f] ml-1.5 shrink-0 whitespace-nowrap">t ore/th</span>
                    </div>
                  </div>
                </div>
                <NumericInput
                  label="Discount rate"
                  value={financialParams.discount_rate != null ? financialParams.discount_rate * 100 : 10}
                  unit=" %/th"
                  min={0}
                  max={100}
                  tooltip="Tingkat diskonto tahunan untuk NPV indikatif (0–100%). Dikirim ke API sebagai pecahan 0–1."
                  onChange={(val) => setFinancialParam('discount_rate', val / 100)}
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: TAMPILAN & LITOLOGI */}
        <div className="border border-[#232338] bg-[#12121e] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setStep3Open(!step3Open)}
            className="w-full px-3.5 py-3 flex items-center justify-between bg-[#161626] hover:bg-[#1c1c30] transition-colors text-left btn-tactile"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center justify-center">
                <Palette size={13} />
              </div>
              <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">Litologi & Layer 3D</span>
            </div>
            {step3Open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          </button>

          {step3Open && (
            <div className="p-3 space-y-3">
              <div className="space-y-1">
                {renderLayerItem({ id: 'blockModel', label: 'Model Blok', icon: Cuboid, hasUpload: true, uploadType: 'block', file: csvFile })}
                {renderLayerItem({ id: 'topography', label: 'Permukaan Topografi', icon: Map, hasUpload: true, uploadType: 'topo', file: topographyFile })}
                {renderLayerItem({ id: 'pitShell', label: 'Batas Pit (Tertambang)', icon: Mountain })}
                {renderLayerItem({ id: 'pitShellWireframe', label: 'Pit Shell Wireframe', icon: Mountain })}
                {renderLayerItem({ id: 'wasteBlocks', label: 'Blok Waste Luar', icon: Box })}
                {renderLayerItem({ id: 'pitBoundary', label: 'Batas Leasing (KML)', icon: Globe })}
              </div>

              {/* Lithologies */}
              {lithologies.length > 0 && (
                <div className="pt-2 border-t border-[#222230]">
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-400 font-semibold">
                    <Palette size={13} className="text-emerald-400" />
                    <span>Warna Domain Litologi</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                    {lithologies.map((litho) => (
                      <div key={litho} className="flex items-center justify-between bg-[#1A1A24] border border-[#2A2A3A] rounded px-2 py-1 text-xs">
                        <span className="text-gray-300 font-mono truncate max-w-[150px]">{litho}</span>
                        <input
                          type="color"
                          value={lithologyColors[litho] || '#3498db'}
                          onChange={(e) => setLithologyColor(litho, e.target.value)}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Run Button */}
      <div className="p-3 bg-[#11111A] border-t border-[#222230]">
        <button
          onClick={runOptimization}
          disabled={isLoading}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
            isLoading
              ? 'bg-blue-900/40 text-blue-400 border border-blue-700/50 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 border border-emerald-400/30 active:scale-[0.99]'
          }`}
        >
          <Pickaxe size={15} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Menghitung Pit Limit...' : 'Jalankan Optimasi Pit'}
        </button>
      </div>
    </div>
  );
}

