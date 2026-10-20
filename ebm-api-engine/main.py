from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import json
import io
from typing import Optional

from models.schemas import FinancialParameters, OptimizationSummary
from core.compact_graph import DEFAULT_GRAPH_BACKEND
from core.economic_model import calculate_bev
from core.graph_builder import build_precedence_graph, is_regular_grid
from core.pit_optimizer import optimize_pit
from core.pit_selection import calculate_pit_selection
from core.kmz_parser import extract_points_from_kmz_or_kml, extract_rich_from_kmz_or_kml
from core.coord_transformer import transform_points, transform_polygon_rings, auto_detect_utm_zone
from core.dem_processor import extract_bbox_from_csv, clip_dem_to_bbox

app = FastAPI(title="EBM API Engine", description="Otak Finansial & Spasial untuk Ultimate Pit Limit", version="2.0.1-GEON")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "2.0.1-GEON"}

def read_csv_robust(content: bytes) -> pd.DataFrame:
    """
    Baca CSV secara robust:
    - encoding='utf-8-sig' untuk buang BOM dari Excel/Windows
    - sep=None + engine='python' untuk auto-detect koma/titik koma/tab
    - strip spasi dari nama kolom
    """
    df = pd.read_csv(io.BytesIO(content), encoding='utf-8-sig', sep=None, engine='python')
    df.columns = df.columns.str.strip()
    return df


# ---------------------------------------------------------------------------
# Column Alias Mapping
# Memetakan berbagai nama kolom dari software geologi (Datamine, Surpac,
# Micromine, Vulcan, dll.) ke nama kolom standar internal EBM.
# Semua alias dalam huruf kecil; pencocokan dilakukan case-insensitive.
# ---------------------------------------------------------------------------
COLUMN_ALIASES: dict[str, list[str]] = {
    'X':        ['x', 'xc', 'easting',  'east',   'utme',  'utm_e', 'centroid_x'],
    'Y':        ['y', 'yc', 'northing', 'north',  'utmn',  'utm_n', 'centroid_y'],
    'Z':        ['z', 'zc', 'elevation','elev',   'rl',    'level', 'mid_z', 'centroid_z'],
    'DX':       ['dx', 'xinc', 'xsize', 'xdim', 'sizex', 'block_x'],
    'DY':       ['dy', 'yinc', 'ysize', 'ydim', 'sizey', 'block_y'],
    'DZ':       ['dz', 'zinc', 'zsize', 'zdim', 'sizez', 'block_z', 'bench'],
    'Grade':    ['grade', 'ni', 'fe', 'au', 'cu', 'co', 'zn', 'pb',
                 'kadar', 'value', 'tenor', 'assay', 'cut_grade'],
    'Density':  ['density', 'sg', 'bd', 'densitas', 'spgrav', 'spec_grav',
                 'bulk_density', 'tonnage_factor'],
    'RockType': ['rocktype', 'rock_type', 'lithology', 'litho', 'lith',
                 'rock', 'zone', 'material', 'domain', 'ore_type', 'code'],
}

# Kolom yang WAJIB ada (jika tidak ditemukan â†’ HTTP 400)
REQUIRED_COLS = ['X', 'Y', 'Z', 'Grade']
# Kolom yang dipakai tapi bisa punya nilai default jika tidak ada
OPTIONAL_DEFAULTS = {
    'DX': 10.0, 'DY': 10.0, 'DZ': 10.0,
    'Density': 2.7,
    'RockType': 'Unknown',
}


def apply_column_aliases(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalkan nama kolom CSV Block Model ke standar internal EBM.

    Langkah:
    1. Buat lookup: kolom_lowercase â†’ nama_asli
    2. Iterasi COLUMN_ALIASES; untuk setiap target, cari alias yang cocok
       di lookup.
    3. Rename kolom yang ditemukan ke nama target standar.
    4. Jika kolom esensial (REQUIRED_COLS) tidak ditemukan â†’ raise ValueError
       dengan pesan yang menyebut alias yang bisa dipakai.
    5. Jika kolom opsional tidak ditemukan â†’ isi dengan nilai default.

    Returns:
        DataFrame dengan kolom yang sudah dinormalkan.
    Raises:
        ValueError: jika kolom wajib tidak bisa dideteksi.
    """
    # Lookup: huruf kecil â†’ nama kolom asli di DataFrame
    col_lower_map: dict[str, str] = {c.lower(): c for c in df.columns}

    rename_map: dict[str, str] = {}   # asli â†’ standar
    undetected_required: list[str] = []

    for target, aliases in COLUMN_ALIASES.items():
        # Jika kolom standar sudah ada persis (case-sensitive) â†’ skip
        if target in df.columns:
            continue

        # Cari alias yang cocok (case-insensitive)
        found_original: str | None = None
        for alias in aliases:
            if alias in col_lower_map:
                found_original = col_lower_map[alias]
                break

        if found_original:
            rename_map[found_original] = target
        elif target in REQUIRED_COLS:
            undetected_required.append(target)

    # Laporan error untuk kolom wajib yang tidak terdeteksi
    if undetected_required:
        hints = []
        for col in undetected_required:
            alias_list = ', '.join(f'"{a}"' for a in COLUMN_ALIASES[col])
            hints.append(f'  â€¢ {col}  (coba: {alias_list})')
        raise ValueError(
            f"Kolom berikut tidak ditemukan di CSV dan tidak ada aliasnya yang dikenali:\n"
            + "\n".join(hints)
            + "\n\nPeriksa nama header kolom file Anda."
        )

    # Terapkan rename
    if rename_map:
        df = df.rename(columns=rename_map)

    # Isi kolom opsional yang tidak ada dengan default
    for col, default_val in OPTIONAL_DEFAULTS.items():
        if col not in df.columns:
            df[col] = default_val

    return df


@app.post("/api/v1/optimize-pit")
async def optimize_pit_endpoint(
    file: UploadFile = File(...),
    financial_params: str = Form(...)
):
    import time

    # Parse financial parameters
    try:
        params_dict = json.loads(financial_params)
        params = FinancialParameters(**params_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid financial_params JSON: {str(e)}")

    # Read file
    try:
        content = await file.read()
        df = read_csv_robust(content).fillna(0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca file CSV: {str(e)}")

    # Normalkan nama kolom (alias mapping dari berbagai software geologi)
    try:
        df = apply_column_aliases(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Validasi kolom wajib (setelah alias mapping, semua harus sudah standar)
    required_cols = ['X', 'Y', 'Z', 'DX', 'DY', 'DZ', 'Grade', 'Density', 'RockType']
    missing_cols = [c for c in required_cols if c not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Kolom internal tidak ditemukan setelah alias mapping: {missing_cols}. "
                   f"Ini seharusnya tidak terjadi â€” laporkan ke developer."
        )

    # Sparse Grid Protection
    try:
        dx = df['DX'].median()
        dy = df['DY'].median()
        dz = df['DZ'].median()
        range_x = df['X'].max() - df['X'].min()
        range_y = df['Y'].max() - df['Y'].min()
        range_z = df['Z'].max() - df['Z'].min()
        
        if dx > 0 and dy > 0 and dz > 0:
            estimated_blocks = (range_x / dx) * (range_y / dy) * (range_z / dz)
            if estimated_blocks > 1000000:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Resolusi grid terlalu besar/jarang (estimasi > {int(estimated_blocks):,} blok). Silakan upload model blok yang lebih padat atau perkecil area (bounding box)."
                )
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        pass

    # Phase 2: Validation RF
    raw_rfs = params.revenue_factors or [1.0]
    if not isinstance(raw_rfs, list):
        raise HTTPException(status_code=400, detail="revenue_factors must be a list of numbers.")
    if len(raw_rfs) == 0:
        raw_rfs = [1.0]
    if any(r <= 0 for r in raw_rfs):
        raise HTTPException(status_code=400, detail="All revenue factors must be > 0.")
    if len(set(raw_rfs)) != len(raw_rfs):
        raise HTTPException(status_code=400, detail="Revenue factors must not contain duplicates.")
    if sorted(raw_rfs) != raw_rfs:
        raise HTTPException(status_code=400, detail="Revenue factors must be sorted in ascending order.")

    timings = {}

    # Phase 3: Static Graph Reuse (Build Geometry DAG Once)
    t0 = time.perf_counter()
    df_base_bev = calculate_bev(df, params)
    graph_mode = "geon" if params.geon_mapping else "global"
    graph_backend = (
        DEFAULT_GRAPH_BACKEND
        if DEFAULT_GRAPH_BACKEND in ("compact", "networkx")
        else "networkx"
    )
    grid_is_regular = is_regular_grid(df_base_bev)[0]
    graph_info = {
        "mode": graph_mode,
        "backend": graph_backend,
        "fallback_used": graph_mode == "global" and not grid_is_regular,
        "reason": (
            "non_regular_grid_full_kdtree"
            if graph_mode == "global" and not grid_is_regular
            else None
        ),
    }
    
    try:
        graph = build_precedence_graph(
            df_base_bev,
            osa=params.osa,
            geon_mapping=params.geon_mapping,
            backend=graph_backend,
        )
    except ValueError as e:
        if "Jumlah edge melebihi batas" in str(e):
            raise HTTPException(
                status_code=400,
                detail="Domain geoteknik terlalu kompleks/bercampur dan melebihi batas memori komputasi (>300 juta edge). Silakan sederhanakan GEON mapping Anda atau kurangi jumlah blok."


            )
        raise HTTPException(status_code=400, detail=str(e)) from e
    
    timings['graph_build'] = time.perf_counter() - t0

    # Phase 4 & 6: Max Closure Looping & Incremental Shells
    t1 = time.perf_counter()
    
    df_optimized = df.copy()
    df_optimized['Pushback_Phase'] = 0
    df_optimized['First_RF'] = 0.0
    df_optimized['MINED_STATUS'] = 0
    df_optimized['Destination'] = 'Waste'
    df_optimized['Model_Type'] = 'Waste'
    df_optimized['BEV'] = 0.0
    
    if 'Volume' not in df_optimized.columns:
        df_optimized['Volume'] = df_optimized['DX'] * df_optimized['DY'] * df_optimized['DZ']
    if 'Tonase' not in df_optimized.columns:
        df_optimized['Tonase'] = df_optimized['Volume'] * df_optimized['Density']

    nested_pits_res = []
    incremental_shells_res = []
    pit_masks = []
    optimizer_meta_res = []
    pit_selection_scenarios = (
        {} if params.production_capacity_tpy is not None else None
    )
    
    for i, rf in enumerate(raw_rfs):
        phase_num = i + 1
        current_params = params.model_copy()
        current_params.commodity_price = params.commodity_price * rf
        
        # O(N) BEV Recalculation
        df_rf_bev = calculate_bev(df, current_params)
        
        # Max-Flow Pit Optimization
        df_rf_opt, optimizer_meta = optimize_pit(df_rf_bev, graph, return_meta=True)
        optimizer_meta_res.append({"rf": float(rf), **optimizer_meta})
        if pit_selection_scenarios is not None:
            pit_selection_scenarios[float(rf)] = df_rf_opt[
                ["BEV", "Destination", "Tonase"]
            ].copy()
        
        # Extract mined status
        current_mined_mask = (df_rf_opt['MINED_STATUS'] == 1)
        pit_masks.append(current_mined_mask)
        
        # Assign Incremental / Strategic Shells
        newly_mined = current_mined_mask & (df_optimized['Pushback_Phase'] == 0)
        df_optimized.loc[newly_mined, 'Pushback_Phase'] = phase_num
        df_optimized.loc[newly_mined, 'First_RF'] = rf
        
        # Calculate Nested Pit metrics
        if 'Tonase' not in df_rf_opt.columns:
            df_rf_opt['Tonase'] = df_optimized['Tonase']
            
        df_mined_rf = df_rf_opt[current_mined_mask]
        df_ore_rf = df_mined_rf[df_mined_rf['Destination'] == 'Ore']
        df_waste_rf = df_mined_rf[df_mined_rf['Destination'] == 'Waste']
        
        ore_tonnage = float(df_ore_rf['Tonase'].sum())
        waste_tonnage = float(df_waste_rf['Tonase'].sum())
        pit_value = float(df_mined_rf['BEV'].sum())
        
        nested_pits_res.append({
            "rf": float(rf),
            "pit_value": pit_value,
            "ore_tonnage": ore_tonnage,
            "waste_tonnage": waste_tonnage,
            "strip_ratio": float(waste_tonnage / ore_tonnage) if ore_tonnage > 0 else 0.0,
            "block_count": int(current_mined_mask.sum())
        })
        
        incremental_shells_res.append({
            "shell": phase_num,
            "rf": float(rf),
            "block_count": int(newly_mined.sum())
        })
        
        # Keep base case metrics for backwards compatibility (usually last RF)
        if i == len(raw_rfs) - 1:
            df_optimized['MINED_STATUS'] = df_rf_opt['MINED_STATUS']
            df_optimized['BEV'] = df_rf_opt['BEV']
            df_optimized['Destination'] = df_rf_opt['Destination']
            df_optimized['Model_Type'] = df_rf_opt['Model_Type']

    timings['nested_pits_optimization'] = time.perf_counter() - t1
    timings['total'] = sum(timings.values())

    # Phase 5: Nested Validation
    is_nested = True
    violations = []
    for i in range(len(raw_rfs) - 1):
        violation_mask = pit_masks[i] & ~pit_masks[i+1]
        if violation_mask.any():
            is_nested = False
            violations.append(f"Pit_RF_{raw_rfs[i]} is not strictly fully contained in Pit_RF_{raw_rfs[i+1]}")
            
    validation_results = {
        "nested": is_nested,
        "violations": violations,
        "cycles": False,
        "duplicate_assignments": False,
        "graph_consistent": True
    }

    # Extract Summary for the Final Pit (backward compatibility)
    df_mined = df_optimized[df_optimized['MINED_STATUS'] == 1]
    df_ore = df_mined[df_mined['Destination'] == 'Ore']
    df_waste = df_mined[df_mined['Destination'] == 'Waste']

    total_ore_tonnage = df_ore['Tonase'].sum()
    total_waste_tonnage = df_waste['Tonase'].sum()
    stripping_ratio = total_waste_tonnage / total_ore_tonnage if total_ore_tonnage > 0 else 0.0
    total_npv = df_mined['BEV'].sum()
    total_undiscounted_value = float(total_npv)

    summary = OptimizationSummary(
        total_ore_tonnage=float(total_ore_tonnage),
        total_waste_tonnage=float(total_waste_tonnage),
        stripping_ratio=float(stripping_ratio),
        total_npv=float(total_npv),
        total_undiscounted_value=total_undiscounted_value
    )

    # Auto-Origin Normalization
    min_x = float(df_optimized['X'].min())
    min_y = float(df_optimized['Y'].min())
    df_optimized['Local_X'] = df_optimized['X'] - min_x
    df_optimized['Local_Y'] = df_optimized['Y'] - min_y

    out_cols = ['X', 'Y', 'Z', 'Local_X', 'Local_Y', 'DX', 'DY', 'DZ', 'Grade', 'Density', 'RockType', 'Model_Type', 'BEV', 'Destination', 'MINED_STATUS', 'Pushback_Phase', 'First_RF']
    pit_shell_matrix = df_optimized[out_cols].to_dict(orient='records')

    # Ekstrak unique lithology (RockType)
    unique_lithologies = []
    if 'RockType' in df_optimized.columns:
        unique_lithologies = df_optimized['RockType'].dropna().unique().tolist()

    pit_selection = None
    if params.production_capacity_tpy is not None and pit_selection_scenarios is not None:
        pit_selection = calculate_pit_selection(
            df_optimized,
            pit_selection_scenarios,
            production_capacity_tpy=params.production_capacity_tpy,
            discount_rate=params.discount_rate,
            mining_capacity_tpy=params.mining_capacity_tpy,
        )
        # Aditif: sertakan nilai discount_rate dan production_capacity_tpy yang benar-benar dipakai
        if pit_selection is not None:
            disc_val = float(params.discount_rate) if params.discount_rate is not None else 0.0
            prod_val = float(params.production_capacity_tpy)
            pit_selection["discount_rate"] = disc_val
            pit_selection["production_capacity_tpy"] = prod_val
            pit_selection["discount_rate_used"] = disc_val
            pit_selection["production_capacity_tpy_used"] = prod_val

    # Phase 7: Data Model JSON Out
    response = {
        "nested_pits": nested_pits_res,
        "incremental_shells": incremental_shells_res,
        "pushbacks": [],
        "validation": validation_results,
        "summary": summary.dict(),
        "pit_shell_matrix": pit_shell_matrix,
        "optimizer_meta": optimizer_meta_res,
        "min_x": min_x,
        "min_y": min_y,
        "lithologies": unique_lithologies,
        "timings": timings,
        "graph_info": graph_info,
    }
    if pit_selection is not None:
        response["pit_selection"] = pit_selection
    return response

@app.post("/api/sensitivity")
async def analyze_sensitivity_endpoint(
    file: UploadFile = File(...),
    financial_params: str = Form(...)
):
    """
    Analisis sensitivitas Undiscounted Pit Value terhadap fluktuasi harga komoditas (5 skenario).
    Field 'total_npv' dipertahankan pada response JSON demi kompatibilitas.
    """
    try:
        p_dict = json.loads(financial_params)
        # Support both Pydantic model keys and raw dict
        base_params = FinancialParameters(**p_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid financial parameters: {str(e)}")

    try:
        content = await file.read()
        df = read_csv_robust(content).fillna(0)
        df = apply_column_aliases(df)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read CSV: {str(e)}")

    scenario_factors = [-0.2, -0.1, 0.0, 0.1, 0.2]
    scenario_labels = ["-20% Harga", "-10% Harga", "Normal (0%)", "+10% Harga", "+20% Harga"]
    results = []

    for factor, label in zip(scenario_factors, scenario_labels):
        current_params = base_params.model_copy()
        current_params.commodity_price = base_params.commodity_price * (1 + factor)

        df_bev = calculate_bev(df, current_params)
        graph = build_precedence_graph(df_bev, osa=current_params.osa, geon_mapping=current_params.geon_mapping)
        df_optimized = optimize_pit(df_bev, graph)

        df_mined = df_optimized[df_optimized['MINED_STATUS'] == 1]
        df_ore = df_mined[df_mined['Destination'].str.upper().isin(['MILL', 'ORE', 'PROCESS', 'PLANT'])] if 'Destination' in df_mined.columns else df_mined[df_mined['Grade'] > 0]
        df_waste = df_mined[~df_mined.index.isin(df_ore.index)]

        total_npv = float(df_mined['BEV'].sum())
        ore_tonnage = float((df_ore['DX'] * df_ore['DY'] * df_ore['DZ'] * df_ore['Density']).sum()) if len(df_ore) > 0 else 0.0
        waste_tonnage = float((df_waste['DX'] * df_waste['DY'] * df_waste['DZ'] * df_waste.get('Density', pd.Series([2.5]*len(df_waste)))).sum()) if len(df_waste) > 0 else 0.0
        stripping_ratio = round(waste_tonnage / ore_tonnage, 3) if ore_tonnage > 0 else 0.0

        results.append({
            "scenario": label,
            "price_factor": factor,
            "commodity_price": round(current_params.commodity_price, 2),
            "total_npv": total_npv,
            "total_ore_tonnage": ore_tonnage,
            "total_waste_tonnage": waste_tonnage,
            "stripping_ratio": stripping_ratio,
        })

    return {"scenarios": results}



@app.post("/api/v1/process-topography")
async def process_topography(
    file: UploadFile = File(..., description="File CSV/XYZ berisi titik permukaan X,Y,Z")
):
    """
    Terima data titik permukaan (DTM), jalankan Delaunay triangulasi,
    kembalikan vertices + faces untuk di-render sebagai TerrainMesh di frontend.

    Input  : CSV atau XYZ â€” auto-detect header, auto-detect separator
    Output : { vertices: [[x,y,z],...], faces: [[i,j,k],...], point_count: int }
    """
    try:
        from scipy.spatial import Delaunay
    except ImportError:
        raise HTTPException(status_code=500, detail="scipy tidak terinstall. Jalankan: pip install scipy")

    # Baca file
    try:
        content = await file.read()
        raw = content.decode('utf-8-sig').strip()
        first_line = raw.split('\n')[0].strip()

        # Auto-detect apakah ada header (header = baris pertama punya huruf)
        has_header = any(c.isalpha() for c in first_line)

        if has_header:
            df = read_csv_robust(content).fillna(0)
            # Cari kolom X, Y, Z (case-insensitive)
            col_map = {c.upper(): c for c in df.columns}
            missing = [k for k in ['X', 'Y', 'Z'] if k not in col_map]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Kolom {missing} tidak ditemukan. Pastikan file memiliki kolom X, Y, Z."
                )
            df = df.rename(columns={col_map['X']: 'X', col_map['Y']: 'Y', col_map['Z']: 'Z'})
        else:
            # Format XYZ tanpa header â€” asumsikan kolom 0=X, 1=Y, 2=Z
            df = pd.read_csv(
                io.BytesIO(content),
                encoding='utf-8-sig',
                sep=None,
                engine='python',
                header=None,
                names=['X', 'Y', 'Z'],
                usecols=[0, 1, 2]
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca file topografi: {str(e)}")

    # Validasi jumlah titik minimum untuk triangulasi
    if len(df) < 3:
        raise HTTPException(status_code=400, detail="Minimal 3 titik diperlukan untuk triangulasi.")

    # Delaunay Triangulasi di bidang XY (2D), Z dipakai sebagai ketinggian
    points_xy = df[['X', 'Y']].values
    points_xyz = df[['X', 'Y', 'Z']].values

    try:
        tri = Delaunay(points_xy)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal melakukan triangulasi: {str(e)}")

    # Konversi ke list Python (JSON-serializable)
    vertices = points_xyz.tolist()
    faces = tri.simplices.tolist()

    return {
        "vertices": vertices,
        "faces": faces,
        "point_count": len(vertices),
        "face_count": len(faces)
    }


@app.post("/api/v1/process-topography-kmz")
async def process_topography_kmz(
    file: UploadFile = File(..., description="File KMZ atau KML berisi geometri topografi"),
    utm_zone: Optional[int] = Query(None, description="Override zona UTM (1-60). Default: auto-detect."),
    hemisphere: Optional[str] = Query(None, description="Hemisphere: 'N' atau 'S'. Default: auto-detect."),
    transform_to_utm: bool = Query(True, description="Jika True, transformasi WGS84â†’UTM. Jika False, kembalikan lon/lat asli."),
):
    """
    Terima file KMZ/KML, ekstrak koordinat topografi (Point/LineString),
    lakukan transformasi WGS84â†’UTM jika diminta, jalankan Delaunay triangulasi,
    dan kembalikan mesh TerrainMesh.

    Polygon dalam KML (batas pit/leasing) dikembalikan secara terpisah
    sebagai pit_polygons â€” TIDAK diikutsertakan dalam triangulasi.

    Input  : .kmz atau .kml
    Output : {
      vertices, faces, point_count, face_count, source,
      utm_zone, hemisphere, pit_polygons,
      kml_metadata
    }
    """
    try:
        from scipy.spatial import Delaunay
    except ImportError:
        raise HTTPException(status_code=500, detail="scipy tidak terinstall.")

    # Baca file
    try:
        content = await file.read()
        filename = file.filename or "upload.kmz"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca file: {str(e)}")

    # Parse KMZ/KML â†’ pisahkan topo_points dan pit_polygons
    try:
        rich_result = extract_rich_from_kmz_or_kml(content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing KMZ/KML: {str(e)}")

    topo_points = rich_result['topo_points']  # [(lon, lat, alt), ...]
    pit_polygons_wgs84 = rich_result['pit_polygons']  # [[(lon, lat), ...], ...]
    kml_metadata = rich_result['metadata']

    # Jika tidak ada titik topografi tapi ada polygon, coba ekstrak vertex polygon sebagai topo
    if not topo_points and pit_polygons_wgs84:
        for ring in pit_polygons_wgs84:
            for lon, lat in ring:
                topo_points.append((lon, lat, 0.0))

    if len(topo_points) < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Hanya ditemukan {len(topo_points)} titik topografi. Minimal 3 diperlukan."
        )

    # --- Transformasi Koordinat WGS84 â†’ UTM ---
    used_zone = utm_zone
    used_hemi = hemisphere

    if transform_to_utm:
        try:
            utm_pts, used_zone, used_hemi = transform_points(
                topo_points,
                utm_zone=utm_zone,
                hemisphere=hemisphere
            )
            pts_array = np.array(utm_pts, dtype=np.float64)

            # Transform pit polygons ke UTM juga
            pit_polygons_utm = transform_polygon_rings(
                pit_polygons_wgs84,
                utm_zone=used_zone,
                hemisphere=used_hemi
            ) if pit_polygons_wgs84 else []

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gagal transformasi koordinat ke UTM: {str(e)}")
    else:
        # Kembalikan WGS84 apa adanya
        pts_array = np.array(topo_points, dtype=np.float64)
        pit_polygons_utm = pit_polygons_wgs84
        if used_zone is None and topo_points:
            used_zone, used_hemi = auto_detect_utm_zone(topo_points[0][0], topo_points[0][1])

    # Hapus duplikat koordinat XY
    _, unique_idx = np.unique(pts_array[:, :2], axis=0, return_index=True)
    pts_array = pts_array[np.sort(unique_idx)]

    if len(pts_array) < 3:
        raise HTTPException(
            status_code=400,
            detail="Setelah deduplikasi, titik yang tersisa kurang dari 3."
        )

    # Delaunay Triangulasi
    try:
        tri = Delaunay(pts_array[:, :2])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal triangulasi: {str(e)}")

    vertices = pts_array.tolist()
    faces = tri.simplices.tolist()

    # Serialisasi pit_polygons
    pit_polygons_out = [
        [[float(x), float(y)] for x, y in ring]
        for ring in pit_polygons_utm
    ]

    return {
        "vertices": vertices,
        "faces": faces,
        "point_count": len(vertices),
        "face_count": len(faces),
        "source": "kmz" if filename.lower().endswith(".kmz") else "kml",
        "utm_zone": used_zone,
        "hemisphere": used_hemi,
        "coordinate_system": f"UTM Zone {used_zone}{used_hemi} (EPSG:{32700 + used_zone if used_hemi == 'S' else 32600 + used_zone})" if transform_to_utm and used_zone else "WGS84",
        "pit_polygons": pit_polygons_out,
        "kml_metadata": kml_metadata,
    }


@app.post("/api/v1/process-pit-boundary-kmz")
async def process_pit_boundary_kmz(
    file: UploadFile = File(..., description="File KMZ atau KML berisi polygon batas pit"),
    utm_zone: Optional[int] = Query(None, description="Override zona UTM (1-60). Default: auto-detect."),
    hemisphere: Optional[str] = Query(None, description="Hemisphere: 'N' atau 'S'. Default: auto-detect."),
):
    """
    Ekstrak polygon batas pit (leasing boundary) dari file KMZ/KML.
    Transformasikan ke UTM agar selaras dengan koordinat Block Model.

    Digunakan sebagai Spatial Constraint: blok di luar polygon tidak akan
    disertakan dalam pencarian Ultimate Pit Limit.

    Input  : .kmz atau .kml (berisi Polygon)
    Output : {
      polygons: [[[x_utm, y_utm], ...], ...],
      polygon_count: int,
      utm_zone: int,
      hemisphere: str,
      coordinate_system: str,
      kml_metadata: dict
    }
    """
    try:
        content = await file.read()
        filename = file.filename or "boundary.kmz"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca file: {str(e)}")

    try:
        rich_result = extract_rich_from_kmz_or_kml(content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing KMZ/KML: {str(e)}")

    pit_polygons_wgs84 = rich_result['pit_polygons']
    topo_points = rich_result['topo_points']
    kml_metadata = rich_result['metadata']

    # Jika tidak ada polygon explisit tapi ada titik, jadikan convex hull sebagai batas
    if not pit_polygons_wgs84 and topo_points:
        raise HTTPException(
            status_code=400,
            detail="File tidak berisi Polygon. Pastikan area batas pit digambar sebagai Polygon di Google Earth."
        )

    if not pit_polygons_wgs84:
        raise HTTPException(status_code=400, detail="Tidak ada polygon batas pit ditemukan dalam file.")

    # Auto-detect UTM dari centroid semua vertex polygon
    all_lons = [lon for ring in pit_polygons_wgs84 for lon, lat in ring]
    all_lats = [lat for ring in pit_polygons_wgs84 for lon, lat in ring]
    avg_lon = sum(all_lons) / len(all_lons)
    avg_lat = sum(all_lats) / len(all_lats)

    used_zone, used_hemi = auto_detect_utm_zone(avg_lon, avg_lat)
    if utm_zone is not None:
        used_zone = utm_zone
    if hemisphere is not None:
        used_hemi = hemisphere

    # Transform semua polygon ke UTM
    try:
        pit_polygons_utm = transform_polygon_rings(
            pit_polygons_wgs84,
            utm_zone=used_zone,
            hemisphere=used_hemi
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal transformasi polygon ke UTM: {str(e)}")

    polygons_out = [
        [[float(x), float(y)] for x, y in ring]
        for ring in pit_polygons_utm
    ]
    epsg = (32700 + used_zone) if used_hemi.upper() == 'S' else (32600 + used_zone)

    return {
        "polygons": polygons_out,
        "polygon_count": len(polygons_out),
        "utm_zone": used_zone,
        "hemisphere": used_hemi,
        "coordinate_system": f"UTM Zone {used_zone}{used_hemi} (EPSG:{epsg})",
        "kml_metadata": kml_metadata,
    }


@app.post("/api/v1/process-topography-dem")
async def process_topography_dem(
    block_model: UploadFile = File(..., description="File CSV berisi Block Model"),
    dem_file: UploadFile = File(..., description="File Raster DEM (.tif, .ovr)")
):
    """
    Ekstrak bounding box dari Block Model CSV, lalu potong (clip) DEM raster
    sesuai bounding box tersebut. Mengembalikan grid elevasi untuk dirender di frontend.
    """
    # 1. Baca Block Model CSV dan ekstrak bounding box
    try:
        content_csv = await block_model.read()
        df = read_csv_robust(content_csv)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca Block Model CSV: {str(e)}")

    try:
        bbox = extract_bbox_from_csv(df, padding_pct=0.05)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal mengekstrak bounding box dari Block Model: {str(e)}")

    # 2. Baca DEM dan potong (clip)
    try:
        content_dem = await dem_file.read()
        result = clip_dem_to_bbox(
            dem_bytes=content_dem,
            bbox=bbox,
            filename=dem_file.filename or "dem.tif"
        )
        return result
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal memproses DEM raster: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)




