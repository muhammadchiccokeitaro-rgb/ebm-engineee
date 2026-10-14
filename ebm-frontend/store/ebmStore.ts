import { create } from 'zustand';

// ─── Domain Types ──────────────────────────────────────────────────────────
export interface BlockData {
  X: number; Y: number; Z: number;
  Local_X: number; Local_Y: number;
  DX: number; DY: number; DZ: number;
  Grade: number; Density: number;
  RockType: string; Model_Type: string;
  BEV: number; Destination: string;
  MINED_STATUS: number;
  Pushback_Phase: number;
  First_RF: number;
}

export interface NestedPitShell {
  rf: number;
  pit_value: number;
  ore_tonnage: number;
  waste_tonnage: number;
  strip_ratio: number;
  block_count: number;
}

export interface IncrementalShell {
  shell: number;
  rf: number;
  block_count: number;
}

export interface NestingValidation {
  nested: boolean;
  violations: string[];
  cycles: boolean;
  duplicate_assignments: boolean;
  graph_consistent: boolean;
}

export interface TopoMesh {
  vertices: [number, number, number][];
  faces: [number, number, number][];
  point_count: number;
}

export interface DemGrid {
  grid: number[][];
  extent: { min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number };
  cols: number; rows: number;
}

// Define the FinancialParams type based on usage
export interface FinancialParams {
  commodity_price: number;
  ore_mining_cost: number;
  waste_mining_cost: number;
  processing_cost: number;
  selling_cost: number;
  metallurgical_recovery: number;
  osa: number;
  cut_off_grade: number;
  grade_unit?: 'fraction' | 'percent' | 'g_per_t' | 'ppm';
  price_unit?: 'per_t_metal' | 'per_kg' | 'per_gram' | 'per_troy_oz';
  currency?: string;
  geon_mapping?: Record<string, number>;
  revenue_factors?: number[];
  production_capacity_tpy?: number | null;
  discount_rate?: number | null;
}

export interface PitSelectionCandidate {
  rf: number;
  undiscounted_value: number;
  ore_tonnes: number;
  waste_tonnes: number;
  stripping_ratio: number;
  mine_life_years: { best: number; worst: number };
  npv_best: number;
  npv_worst: number;
}

export interface PitSelectionResult {
  candidates: PitSelectionCandidate[];
  recommendation: {
    best_case_rf: number | null;
    worst_case_rf: number | null;
    recommendations_differ: boolean;
  };
  assumptions: Record<string, any>;
  valuation_basis: string;
}

interface EBMStore {
  // State from InspectorPanel
  summary: any;
  selectedBlock: any | null;
  originX: number;
  originY: number;
  originZ: number;
  clippingZ: number;
  setClippingZ: (z: number) => void;
  clippingX: number;
  setClippingX: (x: number) => void;
  clippingY: number;
  setClippingY: (y: number) => void;
  utmZone: string | null;
  utmHemisphere: string | null;
  coordinateSystem: string | null;
  kmlMetadata: { topo_point_count: number; polygon_count: number };
  pitBoundaryPolygons: any[];
  minZ: number;
  maxZ: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pitBlocks: BlockData[];
  topoMesh: TopoMesh | null;
  demGrid: DemGrid | null;
  financialParams: FinancialParams;
  viewMode: string;
  lithologyColors: Record<string, string>;
  showInspector: boolean;
  showCanvas: boolean;
  setShowCanvas: (show: boolean) => void;
  showSensitivity: boolean;
  setShowSensitivity: (show: boolean) => void;
  showWorkspaceModal: boolean;
  setShowWorkspaceModal: (show: boolean) => void;
  activeTab: 'workspace' | 'report';
  setActiveTab: (tab: 'workspace' | 'report') => void;
  canvasTheme: 'dark' | 'light';
  setCanvasTheme: (theme: 'dark' | 'light') => void;
  r3fContext: any;

  // State from ProjectExplorer
  layerVisibility: Record<string, boolean>;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setCsvFile: (file: File | null) => void;
  setTopographyFile: (file: File | null) => void;
  csvFile: File | null;
  topographyFile: File | null;
  setFinancialParam: (key: keyof FinancialParams, value: any) => void;
  processKmzAsPitBoundary: () => void;
  isLoading: boolean;
  isTopoLoading: boolean;
  isStale: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  successMsg: string | null;
  setSuccessMsg: (msg: string | null) => void;
  lithologies: string[];
  setLithologyColor: (litho: string, color: string) => void;
  downloadWorkspace: () => void;
  loadWorkspace: (content: string) => void;
  scanCsvBounds: (file: File) => Promise<void>;
  geonEnabled: boolean;
  geonMapping: Record<string, number>;
  setGeonEnabled: (enabled: boolean) => void;
  setGeonMapping: (mapping: Record<string, number>) => void;

  nestedPits: NestedPitShell[];
  incrementalShells: IncrementalShell[];
  nestingValidation: NestingValidation | null;
  activeShell: number; // 0 = UPL (all), 1..N = show up to shell N
  setActiveShell: (shell: number | ((prev: number) => number)) => void;
  isNestedPitWindowOpen: boolean;
  setIsNestedPitWindowOpen: (isOpen: boolean) => void;
  pitSelection: PitSelectionResult | null;
  pitSelectionError: string | null;

  // Actions
  setSelectedBlock: (block: any | null) => void;
  setViewMode: (mode: string) => void;
  setR3fContext: (context: any) => void;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  setShowInspector: (show: boolean) => void;
  runOptimization: () => Promise<void>;
  processTopographyFile: (file: File) => Promise<void>;
}

export const getInitialApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('EBM_API_URL');
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
  }
  return (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001';

const useEBMStore = create<EBMStore>((set, get) => ({
  apiUrl: getInitialApiUrl(),
  setApiUrl: (url: string) => {
    const clean = url.trim().replace(/\/+$/, '');
    if (typeof window !== 'undefined') {
      localStorage.setItem('EBM_API_URL', clean);
    }
    set({ apiUrl: clean });
  },
  // Initial state from InspectorPanel
  summary: null,
  selectedBlock: null,
  originX: 0,
  originY: 0,
  originZ: 0,
  clippingZ: 9999,
  setClippingZ: (z) => set({ clippingZ: z }),
  clippingX: 9999,
  setClippingX: (x) => set({ clippingX: x }),
  clippingY: 9999,
  setClippingY: (y) => set({ clippingY: y }),
  utmZone: null,
  utmHemisphere: null,
  coordinateSystem: null,
  kmlMetadata: { topo_point_count: 0, polygon_count: 0 },
  pitBoundaryPolygons: [],
  minZ: 0,
  maxZ: 0,
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
  pitBlocks: [],
  topoMesh: null,
  demGrid: null,
  financialParams: {
    commodity_price: 50000,
    ore_mining_cost: 45000,
    waste_mining_cost: 2500,
    processing_cost: 4500,
    selling_cost: 15000,
    metallurgical_recovery: 0.9,
    osa: 45,
    cut_off_grade: 0.9,
    grade_unit: 'g_per_t',
    price_unit: 'per_gram',
    currency: 'IDR',
    revenue_factors: [0.6, 0.8, 1.0],
    production_capacity_tpy: null,
    discount_rate: null,
  },
  viewMode: 'Grade Heatmap',
  lithologyColors: {},
  showInspector: true,
  showCanvas: true,
  setShowCanvas: (show) => set({ showCanvas: show }),
  showSensitivity: false,
  setShowSensitivity: (show) => set({ showSensitivity: show }),
  showWorkspaceModal: false,
  setShowWorkspaceModal: (show) => set({ showWorkspaceModal: show }),
  activeTab: 'workspace',
  setActiveTab: (tab) => set({ activeTab: tab }),
  canvasTheme: 'dark',
  setCanvasTheme: (theme) => set({ canvasTheme: theme }),
  r3fContext: null,

  // Initial state from ProjectExplorer
  layerVisibility: {
    blockModel: true,
    topography: true,
    pitShell: true,
    pitShellWireframe: false,
    wasteBlocks: false,
    pitBoundary: true,
  },
  setLayerVisibility: (id, visible) => set((state) => ({
    layerVisibility: { ...state.layerVisibility, [id]: visible },
  })),
  setCsvFile: (file) => {
    set({ csvFile: file, isStale: true });
    if (file) get().scanCsvBounds(file);
  },
  setTopographyFile: (file) => {
    set({ topographyFile: file });
    if (file) {
      get().processTopographyFile(file);
    }
  },
  csvFile: null,
  topographyFile: null,
  geonEnabled: false,
  geonMapping: {},
  nestedPits: [],
  incrementalShells: [],
  nestingValidation: null,
  activeShell: 0,
  setActiveShell: (shell) => set((state) => ({
    activeShell: typeof shell === 'function' ? shell(state.activeShell) : shell
  })),
  isNestedPitWindowOpen: false,
  setIsNestedPitWindowOpen: (isOpen) => set({ isNestedPitWindowOpen: isOpen }),
  pitSelection: null,
  pitSelectionError: null,
  setGeonEnabled: (enabled) => set({ geonEnabled: enabled, isStale: true }),
  setGeonMapping: (mapping) => set({ geonMapping: mapping, isStale: true }),
  setFinancialParam: (key, value) => set((state) => ({
    financialParams: { ...state.financialParams, [key]: value },
    isStale: true,
  })),
  processKmzAsPitBoundary: async () => {
    const file = get().topographyFile;
    if (!file) {
      alert('Silakan upload file KMZ/KML terlebih dahulu.');
      return;
    }
    set({ isLoading: true });
    try {
      const formData = new FormData();
      formData.append('file', file);

      const apiBase = get().apiUrl || getInitialApiUrl();
      const res = await fetch(`${apiBase}/api/v1/process-pit-boundary-kmz`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal memproses batas pit KMZ');
      }

      const data = await res.json();
      set({
        pitBoundaryPolygons: data.polygons,
        utmZone: data.utm_zone ? String(data.utm_zone) : null,
        utmHemisphere: data.hemisphere || null,
        coordinateSystem: data.coordinate_system || null,
        layerVisibility: { ...get().layerVisibility, pitBoundary: true },
        isLoading: false,
      });
    } catch (error: any) {
      console.error('Pit Boundary KMZ Error:', error);
      set({ error: `Gagal memproses batas pit: ${error.message}`, isLoading: false });
    }
  },
  isLoading: false,
  isTopoLoading: false,
  isStale: false,
  error: null,
  setError: (msg) => set({ error: msg }),
  successMsg: null,
  setSuccessMsg: (msg) => set({ successMsg: msg }),
  lithologies: [],
  setLithologyColor: (litho, color) => set((state) => ({
    lithologyColors: { ...state.lithologyColors, [litho]: color },
  })),
  scanCsvBounds: async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return;

      // Auto-detect separator
      const firstLine = lines[0];
      const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
      const headers = firstLine.split(sep).map(h => h.trim().replace(/^\uFEFF/, '')); // strip BOM

      // Find column indices for X, Y, Z (case-insensitive alias matching)
      const X_ALIASES = ['x', 'xc', 'easting', 'east', 'utme', 'utm_e', 'centroid_x'];
      const Y_ALIASES = ['y', 'yc', 'northing', 'north', 'utmn', 'utm_n', 'centroid_y'];
      const Z_ALIASES = ['z', 'zc', 'elevation', 'elev', 'rl', 'level', 'mid_z', 'centroid_z'];

      const findCol = (aliases: string[]) => {
        const lowerHeaders = headers.map(h => h.toLowerCase());
        for (const a of aliases) {
          const idx = lowerHeaders.indexOf(a);
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const xIdx = findCol(X_ALIASES);
      const yIdx = findCol(Y_ALIASES);
      const zIdx = findCol(Z_ALIASES);

      if (xIdx < 0 || yIdx < 0 || zIdx < 0) return; // cannot determine bounds

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep);
        const x = parseFloat(cols[xIdx]);
        const y = parseFloat(cols[yIdx]);
        const z = parseFloat(cols[zIdx]);
        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }

      if (!isFinite(minX)) return; // no valid rows parsed

      // Local_X = X - minX, Local_Y = Y - minY
      const localMaxX = maxX - minX;
      const localMaxY = maxY - minY;

      set({
        minX: 0,
        maxX: localMaxX,
        minY: 0,
        maxY: localMaxY,
        minZ,
        maxZ,
        clippingX: localMaxX + 10,
        clippingY: localMaxY + 10,
        clippingZ: maxZ + 10,
      });
    } catch (e) {
      console.warn('CSV bounds scan failed:', e);
    }
  },
  downloadWorkspace: () => {
    const { financialParams, lithologyColors, viewMode, layerVisibility, clippingX, clippingY, clippingZ, minX, maxX, minY, maxY, minZ, maxZ } = get();
    const workspaceData = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      financialParams,
      lithologyColors,
      viewMode,
      layerVisibility,
      bounds: { clippingX, clippingY, clippingZ, minX, maxX, minY, maxY, minZ, maxZ },
    };
    const blob = new Blob([JSON.stringify(workspaceData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ebm_workspace_${Date.now()}.ebm`;
    a.click();
    URL.revokeObjectURL(url);
  },
  loadWorkspace: (content: string) => {
    try {
      const data = JSON.parse(content);
      const updates: any = {};
      if (data.financialParams) updates.financialParams = { ...get().financialParams, ...data.financialParams };
      if (data.lithologyColors) updates.lithologyColors = data.lithologyColors;
      if (data.viewMode) updates.viewMode = data.viewMode;
      if (data.layerVisibility) updates.layerVisibility = { ...get().layerVisibility, ...data.layerVisibility };
      if (data.bounds) {
        const b = data.bounds;
        if (b.minX !== undefined) updates.minX = b.minX;
        if (b.maxX !== undefined) updates.maxX = b.maxX;
        if (b.minY !== undefined) updates.minY = b.minY;
        if (b.maxY !== undefined) updates.maxY = b.maxY;
        if (b.minZ !== undefined) updates.minZ = b.minZ;
        if (b.maxZ !== undefined) updates.maxZ = b.maxZ;
        if (b.clippingX !== undefined) updates.clippingX = b.clippingX;
        if (b.clippingY !== undefined) updates.clippingY = b.clippingY;
        if (b.clippingZ !== undefined) updates.clippingZ = b.clippingZ;
      }
      set(updates);
    } catch (e: any) {
      alert(`Gagal memuat workspace: ${e.message}`);
    }
  },

  // Actions
  setSelectedBlock: (block) => set({ selectedBlock: block }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setR3fContext: (context) => set({ r3fContext: context }),
  setShowInspector: (show) => set({ showInspector: show }),

  processTopographyFile: async (file: File) => {
    set({ isTopoLoading: true, topoMesh: null, demGrid: null });
    try {
      const formData = new FormData();
      formData.append('file', file);

      const ext = file.name.split('.').pop()?.toLowerCase();
      const apiBase = get().apiUrl || getInitialApiUrl();
      let endpoint = `${apiBase}/api/v1/process-topography`;
      if (ext === 'kmz' || ext === 'kml') {
        endpoint = `${apiBase}/api/v1/process-topography-kmz`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Gagal memproses topografi');
      }

      const data = await res.json();
      const topoMesh: TopoMesh = {
        vertices: data.vertices,
        faces: data.faces,
        point_count: data.point_count,
      };

      const updates: any = {
        topoMesh,
        isTopoLoading: false,
        utmZone: data.utm_zone ? String(data.utm_zone) : null,
        utmHemisphere: data.hemisphere || null,
        coordinateSystem: data.coordinate_system || null,
      };

      if (data.pit_polygons && data.pit_polygons.length > 0) {
        updates.pitBoundaryPolygons = data.pit_polygons;
        updates.layerVisibility = { ...get().layerVisibility, pitBoundary: true, topography: true };
      }

      if (data.kml_metadata) {
        updates.kmlMetadata = {
          topo_point_count: data.point_count || 0,
          polygon_count: data.pit_polygons ? data.pit_polygons.length : 0,
        };
      }

      set(updates);
    } catch (error: any) {
      console.error('Topografi error:', error);
      alert(`Gagal memproses file topografi: ${error.message}`);
      set({ isTopoLoading: false });
    }
  },

  runOptimization: async () => {
    const { financialParams, csvFile, lithologyColors } = get();
    if (!csvFile) { 
      set({ error: 'Silakan upload file model blok (CSV) terlebih dahulu.' });
      return; 
    }

    set({ isLoading: true, error: null, successMsg: null });

    try {
      const { geonEnabled, geonMapping } = get();
      const fp = financialParams;
      const payload: Record<string, any> = {
        ...fp,
        ...(geonEnabled && Object.keys(geonMapping).length > 0
          ? { geon_mapping: geonMapping }
          : { geon_mapping: null }),
      };
      // Only send pit selection params if production_capacity_tpy is set and > 0
      if (!fp.production_capacity_tpy || fp.production_capacity_tpy <= 0) {
        delete payload.production_capacity_tpy;
        delete payload.discount_rate;
      } else {
        payload.production_capacity_tpy = fp.production_capacity_tpy;
        payload.discount_rate = fp.discount_rate ?? 0.0;
      }
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('financial_params', JSON.stringify(payload));

      const apiBase = get().apiUrl || getInitialApiUrl();
      const res = await fetch(`${apiBase}/api/v1/optimize-pit`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error (Status ${res.status})`);
      }

      // Use text()+JSON.parse instead of res.json() to avoid recursive JSON parsing
      // which can overflow the call stack on very large block arrays (28k+ blocks).
      const rawText = await res.text();
      const data = JSON.parse(rawText);

      const blocks: BlockData[] = data.pit_shell_matrix || [];
      let minX = 0, maxX = 100, minY = 0, maxY = 100, minZ = 0, maxZ = 100;
      if (blocks.length > 0) {
        // Use a single for-loop pass to find all bounds — zero function-call overhead,
        // zero extra array allocations, safe at any block count.
        let x0 = (blocks[0] as any).Local_X, x1 = x0;
        let y0 = (blocks[0] as any).Local_Y, y1 = y0;
        let z0 = (blocks[0] as any).Z,       z1 = z0;
        for (let i = 1; i < blocks.length; i++) {
          const b = blocks[i] as any;
          if (b.Local_X < x0) x0 = b.Local_X; else if (b.Local_X > x1) x1 = b.Local_X;
          if (b.Local_Y < y0) y0 = b.Local_Y; else if (b.Local_Y > y1) y1 = b.Local_Y;
          if (b.Z       < z0) z0 = b.Z;       else if (b.Z       > z1) z1 = b.Z;
        }
        minX = x0; maxX = x1;
        minY = y0; maxY = y1;
        minZ = z0; maxZ = z1;
      }

      // Default distinct color palette for geological lithologies
      const DEFAULT_LITHO_PALETTE = [
        '#3498db', '#e67e22', '#2ecc71', '#9b59b6', '#1abc9c',
        '#e74c3c', '#f39c12', '#d35400', '#16a085', '#8e44ad',
        '#27ae60', '#2980b9', '#c0392b', '#7f8c8d'
      ];

      const incomingLithos: string[] = data.lithologies || [];
      const updatedColors: Record<string, string> = { ...lithologyColors };
      incomingLithos.forEach((litho, idx) => {
        if (!updatedColors[litho]) {
          updatedColors[litho] = DEFAULT_LITHO_PALETTE[idx % DEFAULT_LITHO_PALETTE.length];
        }
      });

      set({ 
        summary: data.summary, 
        pitBlocks: blocks,
        nestedPits: data.nested_pits || [],
        incrementalShells: data.incremental_shells || [],
        nestingValidation: data.validation || null,
        activeShell: (data.incremental_shells?.length) || 0,
        isNestedPitWindowOpen: data.nested_pits && data.nested_pits.length > 1,
        pitSelection: data.pit_selection ?? null,
        pitSelectionError: null,
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ,
        clippingX: maxX + 10,
        clippingY: maxY + 10,
        clippingZ: maxZ + 10,
        originX: data.min_x,
        originY: data.min_y,
        originZ: 0,
        lithologies: incomingLithos,
        lithologyColors: updatedColors,
        // Default to 'Destination' heatmap so Ore=Gold, Waste=Gray are immediately visible
        viewMode: 'Destination',
        layerVisibility: { ...get().layerVisibility, blockModel: true, pitShell: true },
        isLoading: false,
        isStale: false,
        successMsg: 'Optimasi batas pit selesai dengan sukses.'
      });
      
    } catch (error: any) {
      console.error(error);
      set({ error: error.message, isLoading: false });
    }
  },
}));

export default useEBMStore;
export { useEBMStore };
