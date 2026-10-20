/**
 * exportPDF.ts — EBM Engine PDF Report Generator
 * Prinsip: halaman tidak terpotong, angka format Indonesia penuh,
 * istilah teknis tetap, "45°" bukan "45deg", catatan tidak didiskon.
 */

import { useEBMStore } from '../store/ebmStore';

const APP_VERSION = '2.0.0';
const PAGE_H = 297;  // A4 mm
const PAGE_W = 210;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 14;
const SAFE_BOTTOM = PAGE_H - FOOTER_H - 6; // last safe y before footer

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtID(n: number, decimals = 2): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(n);
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.slice(0, 2), 16) || 180,
    parseInt(c.slice(2, 4), 16) || 180,
    parseInt(c.slice(4, 6), 16) || 180,
  ];
}

function gUnitLabel(grade_unit?: string): string {
  switch (grade_unit) {
    case 'fraction': return 'fraksi';
    case 'percent':  return '%';
    case 'ppm':      return 'ppm';
    case 'g_per_t':
    default:         return 'g/t';
  }
}

function pUnitLabel(price_unit?: string, currency = 'IDR'): string {
  switch (price_unit) {
    case 'per_kg':       return `${currency}/kg`;
    case 'per_troy_oz':  return `${currency}/oz`;
    case 'per_t_metal':  return `${currency}/t logam`;
    case 'per_gram':
    default:             return `${currency}/gram`;
  }
}

// ─── main export ─────────────────────────────────────────────────────────────

export default async function exportPDF(
  summary: any,
  financialParams: any,
  pitBlocks: any[],
  lithologyColors: Record<string, string>,
  pitSelection?: any | null,
) {
  const store = useEBMStore.getState();
  const { r3fContext, setViewMode, viewMode: originalMode, csvFile } = store as any;
  const { jsPDF } = await import('jspdf');

  // ── derived metrics (computed on frontend, no new API fields needed) ───────
  const mined = pitBlocks.filter((b: any) => b.MINED_STATUS === 1);
  const totalBlocks = pitBlocks.length;
  const minedCount = mined.length;
  const oreBlocks  = mined.filter((b: any) => b.Destination === 'Ore' || b.Model_Type === 'Ore');
  const weightedGrade = oreBlocks.length > 0
    ? oreBlocks.reduce((s: number, b: any) => {
        const dz = b.DZ ?? 10; const dx = b.DX ?? 10; const dy = b.DY ?? 10;
        const t = (dx * dy * dz * (b.Density ?? 2.7));
        return s + (b.Grade ?? 0) * t;
      }, 0) / oreBlocks.reduce((s: number, b: any) => {
        const dz = b.DZ ?? 10; const dx = b.DX ?? 10; const dy = b.DY ?? 10;
        return s + (dx * dy * dz * (b.Density ?? 2.7));
      }, 0)
    : null;

  const allZ = mined.map((b: any) => b.Z ?? 0);
  const pitDepth = allZ.length > 1
    ? Math.max(...allZ) - Math.min(...allZ) + (mined[0]?.DZ ?? 10)
    : null;

  // block size from first block
  const bDX = mined[0]?.DX ?? pitBlocks[0]?.DX ?? '-';
  const bDY = mined[0]?.DY ?? pitBlocks[0]?.DY ?? '-';
  const bDZ = mined[0]?.DZ ?? pitBlocks[0]?.DZ ?? '-';
  const blockSizeStr = (bDX === bDY && bDX === bDZ) ? `${bDX} m (kubus)` : `${bDX}×${bDY}×${bDZ} m`;

  const curr = financialParams.currency || 'IDR';
  const gUnit = gUnitLabel(financialParams.grade_unit);
  const pUnit = pUnitLabel(financialParams.price_unit, curr);
  const fmtCur = (n: number) => `${curr} ${fmtID(n)}`;
  const fileName = csvFile?.name ?? '(tidak diketahui)';

  // ── jsPDF document ────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let pageNum = 0;
  let totalPages = 0; // filled at save
  let y = 0;

  // ── page primitives ───────────────────────────────────────────────────────
  function addPageHeader(title: string) {
    pageNum++;
    doc.setFillColor(22, 33, 72);
    doc.rect(0, 0, PAGE_W, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('EBM ENGINE - Laporan Optimasi Pit', MARGIN, 9);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(title, MARGIN, 17);
    doc.text(new Date().toLocaleString('id-ID'), PAGE_W - MARGIN, 17, { align: 'right' });
    y = 30;
  }

  function addFooter() {
    doc.setFillColor(240, 242, 248);
    doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, 'F');
    doc.setTextColor(140, 140, 160); doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
    doc.text(`EBM Engine v${APP_VERSION} - Ultimate Pit Limit Optimizer`, MARGIN, PAGE_H - 5);
    doc.text(`Halaman ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' });
  }

  function section(title: string) {
    ensureSpace(14);
    doc.setTextColor(22, 33, 72); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
    doc.text(title, MARGIN, y); y += 3.5;
    doc.setDrawColor(22, 33, 72); doc.setLineWidth(0.35);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 5;
  }

  function ensureSpace(needed: number) {
    if (y + needed > SAFE_BOTTOM) {
      addFooter();
      doc.addPage();
      addPageHeader('(lanjutan)');
    }
  }

  function row(label: string, value: string, isLast = false) {
    ensureSpace(7.5);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(70, 70, 70);
    doc.text(label, MARGIN, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 15, 20);
    doc.text(value, PAGE_W - MARGIN, y, { align: 'right' });
    if (!isLast) {
      doc.setDrawColor(225, 227, 235); doc.setLineWidth(0.15);
      doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
    }
    y += 6.5;
  }

  function noteRow(text: string) {
    ensureSpace(6);
    doc.setFontSize(7.2); doc.setFont('helvetica', 'italic'); doc.setTextColor(110, 110, 110);
    doc.text(text, MARGIN, y); y += 5;
  }

  // ============================================================================
  // HALAMAN 1 — Ringkasan Eksekutif, Parameter Finansial & Metadata
  // ============================================================================
  addPageHeader('Halaman 1: Ringkasan Eksekutif & Parameter Proyek');

  section('Ringkasan Eksekutif');
  row('Total Undiscounted Pit Value', fmtCur(summary.total_undiscounted_value ?? summary.total_npv));
  row('Total Ore Ditambang', `${fmtID(summary.total_ore_tonnage)} t`);
  row('Total Waste Ditambang', `${fmtID(summary.total_waste_tonnage)} t`);
  row('Stripping Ratio (Waste:Ore)', fmtID(summary.stripping_ratio));
  row('Kadar Rata-rata Bijih Tergali', weightedGrade !== null ? `${fmtID(weightedGrade, 4)} ${gUnit}` : '-');
  row('Kedalaman Pit (Delta Z)', pitDepth !== null ? `${fmtID(pitDepth)} m` : '-');
  row('Blok Tergali / Total Blok', `${fmtID(minedCount, 0)} / ${fmtID(totalBlocks, 0)} blok`);
  row('Blok Ore Tergali', `${fmtID(oreBlocks.length, 0)} blok`, true);
  noteRow('* Nilai tidak didiskon; blok waste bernilai negatif karena digali untuk mengakses bijih.');
  y += 2;

  section('Parameter Finansial & Geometri');
  row('Satuan Kadar', gUnit);
  row('Satuan Harga', pUnit);
  row('Mata Uang', curr);
  row('Harga Komoditas', `${fmtCur(financialParams.commodity_price)} ${pUnit}`);
  row('Biaya Tambang Ore', `${fmtCur(financialParams.ore_mining_cost)} ${curr}/t`);
  row('Biaya Tambang Waste', `${fmtCur(financialParams.waste_mining_cost)} ${curr}/t`);
  row('Biaya Pengolahan', `${fmtCur(financialParams.processing_cost)} ${curr}/t`);
  row('Biaya Penjualan', `${fmtCur(financialParams.selling_cost)} ${curr}/t`);
  row('Recovery Metalurgi', `${fmtID(financialParams.metallurgical_recovery * 100, 1)}%`);
  row('Cut-off Grade', `${fmtID(financialParams.cut_off_grade, 4)} ${gUnit}`);
  row('Overall Slope Angle (OSA)', `${financialParams.osa}\xb0`, true);
  y += 2;

  section('Metadata Data & Model');
  row('Berkas Data Masukan', fileName);
  row('Ukuran Blok', blockSizeStr);
  row('Total Blok dalam Model', `${fmtID(totalBlocks, 0)} blok`);
  row('Versi Aplikasi', `EBM Engine v${APP_VERSION}`, true);

  addFooter();

  // ============================================================================
  // HALAMAN 2 — Evaluasi NPV Indikatif & Pemilihan Pit (Bila Tersedia)
  // ============================================================================
  if (pitSelection && pitSelection.candidates && pitSelection.candidates.length > 0) {
    doc.addPage();
    addPageHeader('Halaman 2: Evaluasi NPV Indikatif & Pemilihan Pit (Pit Selection)');

    const ps = pitSelection;
    section('Evaluasi NPV per Revenue Factor (Pit Selection)');

    const capVal = ps.production_capacity_tpy ?? ps.production_capacity_tpy_used ?? financialParams.production_capacity_tpy;
    const capStr = capVal != null && capVal > 0
      ? `${fmtID(capVal, 0)} t/tahun`
      : '—';

    const discVal = ps.discount_rate ?? ps.discount_rate_used;
    const discStr = discVal != null && discVal > 0
      ? `${Number.isInteger(discVal * 100) ? (discVal * 100).toFixed(0) : (discVal * 100).toFixed(1)}%`
      : (discVal === 0 ? 'tidak diset (0%)' : (financialParams.discount_rate != null ? `${fmtID(financialParams.discount_rate * 100, 1)}%` : 'tidak diset (0%)'));

    noteRow(`Dasar Penilaian: ${ps.valuation_basis || 'base_price (RF=1.0)'} | Kapasitas produksi: ${capStr} | Discount rate dipakai: ${discStr}`);
    noteRow('Urutan: Shell demi Shell (RF naik -> Z turun) vs. Bench demi Bench (Z turun langsung).');
    noteRow('Kedua urutan adalah batas indikatif dan tidak ada jaminan salah satunya lebih tinggi.');
    y += 2;

    // Table header — exactly 178 mm (CONTENT_W)
    const colW = [14, 28, 20, 20, 16, 16, 32, 32];
    const colX = colW.reduce((acc: number[], w, i) => {
      acc.push(i === 0 ? MARGIN : acc[i - 1] + colW[i - 1]);
      return acc;
    }, [] as number[]);
    const headers = [
      'RF',
      `Undiscounted (${curr})`,
      'Ore (t)',
      'Waste (t)',
      'SR (W:O)',
      'Umur (th)',
      `NPV shell demi shell (${curr})`,
      `NPV bench demi bench (${curr})`,
    ];
    const maxBest = Math.max(...ps.candidates.map((c: any) => c.npv_best));
    const maxWorst = Math.max(...ps.candidates.map((c: any) => c.npv_worst));

    doc.setFillColor(22, 33, 72); doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(6.2); doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => {
      doc.text(h, colX[i] + (i === 0 ? 1 : colW[i] - 1), y + 4.5, { align: i === 0 ? 'left' : 'right' });
    });
    y += 7;

    ps.candidates.forEach((c: any, idx: number) => {
      if (idx % 2 === 0) { doc.setFillColor(248, 249, 252); doc.rect(MARGIN, y, CONTENT_W, 6.5, 'F'); }
      const isBest = c.npv_best === maxBest && maxBest > 0;
      const isWorst = c.npv_worst === maxWorst && maxWorst > 0;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(30, 30, 30);
      const vals = [
        fmtID(c.rf, 2),
        fmtID(c.undiscounted_value, 0),
        fmtID(c.ore_tonnes, 0),
        fmtID(c.waste_tonnes, 0),
        fmtID(c.stripping_ratio, 2),
        `${c.mine_life_years.best}-${c.mine_life_years.worst}`,
        `${isBest ? '* ' : ''}${fmtID(c.npv_best, 0)}`,
        `${isWorst ? '* ' : ''}${fmtID(c.npv_worst, 0)}`,
      ];
      vals.forEach((v, i) => {
        if (i === 6 && isBest) { doc.setTextColor(20, 120, 60); doc.setFont('helvetica', 'bold'); }
        else if (i === 7 && isWorst) { doc.setTextColor(0, 110, 140); doc.setFont('helvetica', 'bold'); }
        else { doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal'); }
        doc.text(v, colX[i] + (i === 0 ? 1 : colW[i] - 1), y + 4.2, { align: i === 0 ? 'left' : 'right' });
      });
      y += 6.5;
    });

    y += 5;

    // Rekomendasi Box
    if (ps.recommendation && ps.recommendation.best_case_rf !== null) {
      const recH = ps.recommendation.recommendations_differ ? 28 : 24;
      doc.setFillColor(245, 247, 252);
      doc.setDrawColor(200, 208, 228);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN, y, CONTENT_W, recH, 'FD');

      doc.setFontSize(7.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 33, 72);
      doc.text('Rekomendasi Pit Shell Optimal (Indikatif):', MARGIN + 4, y + 5);

      doc.setFontSize(7.2); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
      doc.text(`- RF optimal (shell demi shell): RF ${fmtID(ps.recommendation.best_case_rf, 2)}`, MARGIN + 4, y + 10);
      doc.text(`- RF optimal (bench demi bench): RF ${fmtID(ps.recommendation.worst_case_rf, 2)}`, MARGIN + 4, y + 14.5);
      doc.setFontSize(6.5); doc.setTextColor(90, 90, 100);
      doc.text('Catatan: Kedua urutan adalah batas indikatif dan tidak ada jaminan salah satunya lebih tinggi.', MARGIN + 4, y + 19);

      if (ps.recommendation.recommendations_differ) {
        doc.setTextColor(170, 90, 0); doc.setFont('helvetica', 'italic');
        doc.text('Urutan produksi menghasilkan RF optimal berbeda karena distribusi rasio pengupasan (stripping ratio).', MARGIN + 4, y + 24);
      }
      y += recH + 5;
    }

    // Catatan Asumsi & Batasan Box
    const notes = [
      '- Kedua urutan adalah batas indikatif dan tidak ada jaminan salah satunya lebih tinggi.',
      '- Urutan NPV shell demi shell (RF naik -> Z turun) dan NPV bench demi bench (Z turun langsung) mencerminkan rentang batas teoretis urutan penggalian.',
      '- Tanpa memperhitungkan belanja modal awal (CAPEX), eskalasi biaya penambangan, maupun batasan kapasitas fleet alat berat.',
      '- Tidak memperhitungkan lebar kerja minimum alat operasional (minimum mining width) antar tahapan pushback.',
      '- Nilai ini dihitung untuk membantu penetapan batas pit ultimate dan analisis risiko, bukan pengganti jadwal tambang operasional detail.',
    ];
    const notesH = notes.length * 4.5 + 8;
    doc.setFillColor(250, 250, 252);
    doc.setDrawColor(220, 222, 230);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, CONTENT_W, notesH, 'FD');

    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 90);
    doc.text('Catatan Metodologi & Batasan Teknis:', MARGIN + 4, y + 5);

    doc.setFontSize(6.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 110);
    notes.forEach((n, ni) => {
      doc.text(n, MARGIN + 4, y + 9.5 + ni * 4.2);
    });

    addFooter();
  }

  // ============================================================================
  // HALAMAN LAMPIRAN VISUAL 3D (per-mode, satu per halaman)
  // ============================================================================
  const visualModes: Array<{
    mode: string;
    title: string;
    legend: (doc: any, lx: number, ly: number, maxGrade: number) => number;
  }> = [
    {
      mode: 'Grade Heatmap',
      title: 'Grade Heatmap - Distribusi Kadar Bijih',
      legend: (doc, lx, ly, maxGrade) => {
        const grades = oreBlocks.map((b: any) => b.Grade ?? 0);
        const minG = grades.length > 0 ? Math.min(...grades) : 0;
        const maxG = grades.length > 0 ? Math.max(...grades, 0.01) : 1;
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 33, 72);
        doc.text('Skala Kadar', lx, ly); ly += 4;
        const palette: [number,number,number][] = [[0,0,255],[0,255,255],[0,255,0],[255,255,0],[255,0,0]];
        const sw = CONTENT_W * 0.4 / palette.length;
        palette.forEach((c, i) => {
          doc.setFillColor(c[0], c[1], c[2]);
          doc.rect(lx + i * sw, ly, sw, 5, 'F');
        });
        ly += 6;
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
        doc.text(`${fmtID(minG, 4)} ${gUnit}`, lx, ly);
        doc.text(`${fmtID(maxG, 4)} ${gUnit}`, lx + palette.length * sw, ly, { align: 'right' });
        return ly + 8;
      },
    },
    {
      mode: 'Lithology',
      title: 'Litologi - Domain Litologi',
      legend: (doc, lx, ly) => {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 33, 72);
        doc.text('Legenda Litologi', lx, ly); ly += 4;
        Object.entries(lithologyColors).forEach(([name, hex]) => {
          const [r, g, b] = hexToRgb(hex as string);
          doc.setFillColor(r, g, b); doc.rect(lx, ly, 4, 4, 'F');
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
          doc.text(name, lx + 6, ly + 3.2);
          ly += 6;
        });
        return ly + 4;
      },
    },
    {
      mode: 'Economic (BEV)',
      title: 'Economic (BEV) - Nilai Ekonomi Blok',
      legend: (doc, lx, ly) => {
        const bevs = mined.map((b: any) => b.BEV ?? 0);
        const minBev = Math.min(...bevs, 0);
        const maxBev = Math.max(...bevs, 1);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 33, 72);
        doc.text('Skala BEV', lx, ly); ly += 4;
        doc.setFillColor(39, 174, 96); doc.rect(lx, ly, 4, 4, 'F');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40,40,40);
        doc.text(`BEV > 0 (maks: ${curr} ${fmtID(maxBev)})`, lx + 6, ly + 3.2); ly += 6;
        doc.setFillColor(231, 76, 60); doc.rect(lx, ly, 4, 4, 'F');
        doc.text(`BEV <= 0 (min: ${curr} ${fmtID(minBev)})`, lx + 6, ly + 3.2); ly += 6;
        doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(110, 110, 110);
        doc.text('Catatan: skala tidak diratakan; blok waste negatif karena biaya penggalian.', lx, ly);
        return ly + 8;
      },
    },
  ];

  for (const vm of visualModes) {
    doc.addPage();
    addPageHeader(`Lampiran Visual: ${vm.title}`);

    if (!r3fContext?.gl) {
      doc.setTextColor(200, 50, 50); doc.setFontSize(9);
      doc.text('Canvas 3D tidak tersedia. Buka tampilan 3D sebelum mengekspor.', MARGIN, y);
    } else {
      try {
        setViewMode(vm.mode);
        await new Promise(r => setTimeout(r, 300));
        r3fContext.gl.render(r3fContext.scene, r3fContext.camera);
        const dataUrl: string = r3fContext.gl.domElement.toDataURL('image/png');
        const cw = CONTENT_W * 0.62;
        const ratio = r3fContext.gl.domElement.height / r3fContext.gl.domElement.width;
        const ch = Math.min(cw * ratio, SAFE_BOTTOM - y - 30);

        if (dataUrl.startsWith('data:image/png')) {
          doc.addImage(dataUrl, 'PNG', MARGIN, y, cw, ch);
        }
        const lx = MARGIN + cw + 6;
        vm.legend(doc, lx, y + 2, 1);
        y += ch + 8;
        setViewMode(originalMode);
      } catch (e) {
        console.error('Canvas capture failed:', e);
        doc.setTextColor(200, 50, 50); doc.setFontSize(9);
        doc.text('Gagal menangkap gambar 3D.', MARGIN, y);
        setViewMode(originalMode);
      }
    }

    addFooter();
  }

  // ============================================================================
  // HALAMAN TERAKHIR — Penampang Tengah Pit (Cross-section)
  // ============================================================================
  doc.addPage();
  addPageHeader('Lampiran: Penampang Vertikal Pusat Pit (E-W)');

  if (mined.length > 0) {
    try {
      // Group blocks into a 2D slice near centre Y
      const ys = mined.map((b: any) => b.Local_Y ?? b.Y ?? 0);
      const centreY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const slice = mined.filter((b: any) => Math.abs((b.Local_Y ?? b.Y ?? 0) - centreY) <= ((mined[0]?.DY ?? 10) * 1.5));

      const sliceXs = slice.map((b: any) => b.Local_X ?? b.X ?? 0);
      const sliceZs = slice.map((b: any) => b.Z ?? 0);
      const minSX = Math.min(...sliceXs); const maxSX = Math.max(...sliceXs);
      const minSZ = Math.min(...sliceZs); const maxSZ = Math.max(...sliceZs);
      const spanX = maxSX - minSX || 1;
      const spanZ = maxSZ - minSZ || 1;

      const PW = CONTENT_W - 10;
      const PH = Math.min(100, SAFE_BOTTOM - y - 30);
      const ox = MARGIN + 5;
      const oy = y + PH;

      // Draw axes
      doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.3);
      doc.line(ox, y, ox, oy); // Z axis
      doc.line(ox, oy, ox + PW, oy); // X axis
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('Timur (+X) ->', ox + PW - 5, oy + 4);
      doc.text('Elevasi Z (m)', ox - 10, y + 4, { angle: 90 });

      // Draw blocks as rectangles
      const bwPx = Math.max(1.5, PW / (spanX / (mined[0]?.DX ?? 10) + 1));
      const bhPx = Math.max(1.5, PH / (spanZ / (mined[0]?.DZ ?? 10) + 1));
      slice.forEach((b: any) => {
        const bx = ox + ((( b.Local_X ?? b.X ?? 0) - minSX) / spanX) * PW;
        const bz = oy - (((b.Z ?? 0) - minSZ) / spanZ) * PH;
        const isOre = b.Destination === 'Ore' || b.Model_Type === 'Ore';
        if (isOre) {
          const g = b.Grade ?? 0;
          const grades = oreBlocks.map((o: any) => o.Grade ?? 0);
          const maxG = Math.max(...grades, 0.01);
          const norm = Math.min(g / maxG, 1);
          // Blue->Red gradient
          const rr = Math.round(norm * 255);
          const gg = Math.round((1 - Math.abs(norm - 0.5) * 2) * 255);
          const bb = Math.round((1 - norm) * 255);
          doc.setFillColor(rr, gg, bb);
        } else {
          doc.setFillColor(160, 160, 160);
        }
        doc.rect(bx, bz - bhPx, bwPx, bhPx, 'F');
      });

      y = oy + 10;

      // Axis tick labels
      doc.setFontSize(6); doc.setTextColor(100, 100, 100);
      [minSZ, (minSZ + maxSZ) / 2, maxSZ].forEach(z => {
        const by = oy - ((z - minSZ) / spanZ) * PH;
        doc.text(fmtID(z, 0), ox - 2, by, { align: 'right' });
      });
      [minSX, (minSX + maxSX) / 2, maxSX].forEach(x => {
        const bx = ox + ((x - minSX) / spanX) * PW;
        doc.text(fmtID(x, 0), bx, oy + 3.5, { align: 'center' });
      });

      // Legend
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 33, 72);
      doc.text('Legenda Penampang', MARGIN, y); y += 5;
      doc.setFillColor(39, 174, 96); doc.rect(MARGIN, y, 4, 4, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(40,40,40);
      doc.text('Ore (kadar di atas cut-off, warna: biru ke merah sesuai kadar)', MARGIN + 6, y + 3); y += 7;
      doc.setFillColor(160, 160, 160); doc.rect(MARGIN, y, 4, 4, 'F');
      doc.text('Waste (digali, negatif BEV)', MARGIN + 6, y + 3); y += 7;
      doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(110, 110, 110);
      doc.text(`Irisan tegak melalui Y ~ ${fmtID(centreY, 0)} m (Lokal); blok = ${blockSizeStr}`, MARGIN, y);
    } catch (e) {
      console.error('Cross-section failed:', e);
      doc.setTextColor(180, 100, 0); doc.setFontSize(8);
      doc.text('Penampang tidak dapat dibuat dari data yang tersedia.', MARGIN, y);
    }
  } else {
    doc.setTextColor(140, 140, 140); doc.setFontSize(9);
    doc.text('Tidak ada blok tergali untuk ditampilkan dalam penampang.', MARGIN, y);
  }

  addFooter();

  // ─── save ─────────────────────────────────────────────────────────────────
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`ebm_report_${ts}.pdf`);
}
