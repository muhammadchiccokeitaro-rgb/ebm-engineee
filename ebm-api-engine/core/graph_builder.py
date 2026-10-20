import pandas as pd
import numpy as np
import networkx as nx
import math
from typing import Optional, Union

from core.compact_graph import CompactGraph, DEFAULT_GRAPH_BACKEND

def _resolve_backend(backend: Optional[str]) -> str:
    if backend is None:
        return DEFAULT_GRAPH_BACKEND
    b = str(backend).strip().lower()
    if b not in ("compact", "networkx"):
        raise ValueError(f"Backend graf tidak dikenal: '{backend}'. Pilihan yang valid: 'compact' atau 'networkx'.")
    return b

def build_precedence_graph_full(df: pd.DataFrame, osa: float, backend: Optional[str] = None) -> Union[CompactGraph, nx.DiGraph]:
    """
    REFERENSI O(N x cone_size): Pembentukan kerucut penuh menggunakan KDTree.
    Dipertahankan sebagai fallback untuk grid non-reguler dan untuk pengujian.
    """
    from scipy.spatial import cKDTree

    b = _resolve_backend(backend)
    bevs   = df['BEV'].values
    xs     = df['X'].values
    ys     = df['Y'].values
    zs     = df['Z'].values
    idx    = np.arange(len(df), dtype=np.int32)

    osa_rad  = math.radians(osa)
    tan_osa  = math.tan(osa_rad)

    unique_z = np.unique(zs)

    tree_by_z: dict = {}
    idx_by_z:  dict = {}
    coords_by_z: dict = {}
    for z_val in unique_z:
        mask = zs == z_val
        coords_xy = np.column_stack([xs[mask], ys[mask]])
        tree_by_z[z_val] = cKDTree(coords_xy)
        idx_by_z[z_val]  = idx[mask]
        coords_by_z[z_val] = coords_xy

    eps = 1e-9
    edges_u = []
    edges_v = []
    
    estimated_edges = 0
    MAX_EDGES = 400_000_000  # ~3.2 GB RAM untuk edge arrays (int32 u+v)

    
    for i, z_lower in enumerate(unique_z):
        points_lower = coords_by_z[z_lower]
        idx_lower_arr = idx_by_z[z_lower]
        
        upper_z_levels = unique_z[unique_z > z_lower]
        for z_upper in upper_z_levels:
            dz = z_upper - z_lower
            radius = (dz / tan_osa) + eps
            
            neighbors_list = tree_by_z[z_upper].query_ball_point(points_lower, r=radius)
            
            for local_i, neighbors in enumerate(neighbors_list):
                if neighbors:
                    real_i = idx_lower_arr[local_i]
                    real_j_arr = idx_by_z[z_upper][neighbors]
                    
                    edges_u.extend([real_i] * len(real_j_arr))
                    edges_v.extend(real_j_arr)
                    estimated_edges += len(real_j_arr)
                    
                    if estimated_edges > MAX_EDGES:
                        raise ValueError(f"Jumlah edge melebihi batas {MAX_EDGES} (OSA {osa}°, blok {len(df)}). "
                                         "Estimasi saat ini terlalu besar sehingga dihentikan mencegah kehabisan memori.")

    if b == "compact":
        u_arr = np.array(edges_u, dtype=np.int32)
        v_arr = np.array(edges_v, dtype=np.int32)
        return CompactGraph(u_arr, v_arr, num_nodes=len(df), node_indices=idx)

    G = nx.DiGraph()
    for i, real_i in enumerate(idx):
        G.add_node(real_i, bev=bevs[i], x=xs[i], y=ys[i], z=zs[i])
    G.add_edges_from(zip(edges_u, edges_v))
    return G

def is_regular_grid(df: pd.DataFrame):
    xs = np.sort(df['X'].unique())
    ys = np.sort(df['Y'].unique())
    zs = np.sort(df['Z'].unique())
    
    if len(xs) < 2 or len(ys) < 2 or len(zs) < 2:
        return False, 0, 0, 0
        
    dxs = np.diff(xs)
    dys = np.diff(ys)
    dzs = np.diff(zs)
    
    dx = float(np.median(dxs[dxs > 1e-3])) if len(dxs[dxs > 1e-3]) > 0 else 0.0
    dy = float(np.median(dys[dys > 1e-3])) if len(dys[dys > 1e-3]) > 0 else 0.0
    dz = float(np.median(dzs[dzs > 1e-3])) if len(dzs[dzs > 1e-3]) > 0 else 0.0
    
    if dx == 0 or dy == 0 or dz == 0:
        return False, 0, 0, 0
        
    min_x, min_y, min_z = xs[0], ys[0], zs[0]
    rem_x = np.abs((df['X'].values - min_x) % dx)
    rem_y = np.abs((df['Y'].values - min_y) % dy)
    rem_z = np.abs((df['Z'].values - min_z) % dz)
    
    valid_x = (rem_x < 1e-3) | ((dx - rem_x) < 1e-3)
    valid_y = (rem_y < 1e-3) | ((dy - rem_y) < 1e-3)
    valid_z = (rem_z < 1e-3) | ((dz - rem_z) < 1e-3)
    
    if not (valid_x.all() and valid_y.all() and valid_z.all()):
        return False, 0, 0, 0
        
    return True, dx, dy, dz

def get_offsets(dx, dy, dz, osa, max_z_levels, osa_by_azimuth=None):
    offsets = set()
    for k in range(1, max_z_levels):
        if osa_by_azimuth is not None:
            if callable(osa_by_azimuth):
                min_osa = min(osa_by_azimuth(az) for az in range(360))
            elif isinstance(osa_by_azimuth, dict):
                min_osa = min(osa_by_azimuth.values())
            else:
                min_osa = min(osa_by_azimuth)
        else:
            min_osa = osa
            
        max_r = (k * dz) / math.tan(math.radians(min_osa)) + 1e-9
        max_di = int(max_r / dx) + 1
        max_dj = int(max_r / dy) + 1
        
        for di in range(-max_di, max_di + 1):
            for dj in range(-max_dj, max_dj + 1):
                if di == 0 and dj == 0:
                    az = 0
                else:
                    az = (90 - math.degrees(math.atan2(dj * dy, di * dx))) % 360
                    
                current_osa = osa
                if osa_by_azimuth is not None:
                    if callable(osa_by_azimuth):
                        current_osa = osa_by_azimuth(az)
                    elif isinstance(osa_by_azimuth, dict):
                        nearest_az = min(osa_by_azimuth.keys(), key=lambda k_az: min(abs(k_az - az), 360 - abs(k_az - az)))
                        current_osa = osa_by_azimuth[nearest_az]
                    else:
                        current_osa = osa_by_azimuth[int(round(az)) % 360]
                        
                r = (k * dz) / math.tan(math.radians(current_osa)) + 1e-9
                if math.hypot(di * dx, dj * dy) <= r:
                    offsets.add((di, dj, k))
    return offsets

def transitive_reduction(offsets):
    reduced = set(offsets)
    original = set(offsets)
    for o in original:
        can_reduce = False
        for o1 in original:
            if o1 == o: continue
            di1, dj1, dk1 = o1
            if dk1 >= o[2]: continue
            
            o2 = (o[0] - di1, o[1] - dj1, o[2] - dk1)
            if o2 in original:
                can_reduce = True
                break
        if can_reduce:
            reduced.remove(o)
    return reduced

_OFFSET_CACHE = {}

def build_precedence_graph_global_osa(
    df: pd.DataFrame,
    osa: float,
    osa_by_azimuth=None,
    backend: Optional[str] = None
) -> Union[CompactGraph, nx.DiGraph]:
    """
    Fase 2: Pembentukan Graf Ketergantungan (Precedence Edge Generation)
    Memanfaatkan deteksi grid reguler, pembentukan pola offset kerucut,
    serta Transitive Reduction untuk menekan jumlah edge menjadi fraksi kecil.
    """
    import time
    t_start = time.time()
    b = _resolve_backend(backend)
    is_reg, dx, dy, dz = is_regular_grid(df)
    
    if not is_reg:
        print("[Graph Builder] Non-regular grid detected. Fallback to Full KDTree.")
        return build_precedence_graph_full(df, osa, backend=b)
        
    min_x, min_y, min_z = df['X'].min(), df['Y'].min(), df['Z'].min()
    
    df_idx = np.round((df['X'].values - min_x) / dx).astype(int)
    df_idy = np.round((df['Y'].values - min_y) / dy).astype(int)
    df_idz = np.round((df['Z'].values - min_z) / dz).astype(int)
    
    nx_cells = df_idx.max() + 1
    ny_cells = df_idy.max() + 1
    nz_cells = df_idz.max() + 1
    
    grid = np.full((nx_cells, ny_cells, nz_cells), -1, dtype=np.int32)
    node_indices = np.arange(len(df), dtype=np.int32)
    grid[df_idx, df_idy, df_idz] = node_indices
    
    cache_key = (round(dx, 4), round(dy, 4), round(dz, 4), round(osa, 4), nz_cells, str(osa_by_azimuth))
    t_off_0 = time.time()
    if cache_key in _OFFSET_CACHE:
        full_offsets, reduced_offsets = _OFFSET_CACHE[cache_key]
        t_off_1 = time.time()
        t_red_1 = t_off_1
    else:
        full_offsets = get_offsets(dx, dy, dz, osa, nz_cells, osa_by_azimuth)
        t_off_1 = time.time()
        reduced_offsets = transitive_reduction(full_offsets)
        t_red_1 = time.time()
        _OFFSET_CACHE[cache_key] = (full_offsets, reduced_offsets)
    
    print(f"[Graph Builder] Timings: Offsets={(t_off_1 - t_off_0)*1000:.1f}ms, Reduction={(t_red_1 - t_off_1)*1000:.1f}ms | Offsets: {len(full_offsets)} -> Reduced: {len(reduced_offsets)}")
    
    t_edge_0 = time.time()
    edges_u = []
    edges_v = []
    exact_edges = 0
    MAX_EDGES = 400_000_000  # ~3.2 GB RAM untuk edge arrays (int32 u+v)
    
    for (di, dj, dk) in reduced_offsets:
        src_i_start = max(0, -di)
        src_i_end = min(nx_cells, nx_cells - di)
        src_j_start = max(0, -dj)
        src_j_end = min(ny_cells, ny_cells - dj)
        src_k_start = max(0, -dk)
        src_k_end = min(nz_cells, nz_cells - dk)
        
        dst_i_start = max(0, di)
        dst_i_end = min(nx_cells, nx_cells + di)
        dst_j_start = max(0, dj)
        dst_j_end = min(ny_cells, ny_cells + dj)
        dst_k_start = max(0, dk)
        dst_k_end = min(nz_cells, nz_cells + dk)
        
        if src_i_start >= src_i_end or src_j_start >= src_j_end or src_k_start >= src_k_end:
            continue
            
        src_slice = grid[src_i_start:src_i_end, src_j_start:src_j_end, src_k_start:src_k_end]
        dst_slice = grid[dst_i_start:dst_i_end, dst_j_start:dst_j_end, dst_k_start:dst_k_end]
        
        valid_mask = (src_slice != -1) & (dst_slice != -1)
        
        u_vals = src_slice[valid_mask]
        v_vals = dst_slice[valid_mask]
        
        edges_u.append(u_vals)
        edges_v.append(v_vals)
        exact_edges += len(u_vals)
        
        if exact_edges > MAX_EDGES:
            raise ValueError(f"Jumlah edge melebihi batas {MAX_EDGES} (OSA {osa}°, blok {len(df)}).")
            
    if edges_u:
        edges_u_arr = np.concatenate(edges_u)
        edges_v_arr = np.concatenate(edges_v)
    else:
        edges_u_arr = np.array([], dtype=np.int32)
        edges_v_arr = np.array([], dtype=np.int32)

    if b == "compact":
        return CompactGraph(edges_u_arr, edges_v_arr, num_nodes=len(df), node_indices=node_indices)

    G = nx.DiGraph()
    bevs = df['BEV'].values
    xs = df['X'].values
    ys = df['Y'].values
    zs = df['Z'].values
    idx = node_indices
    for i, real_i in enumerate(idx):
        G.add_node(real_i, bev=bevs[i], x=xs[i], y=ys[i], z=zs[i])
        
    if len(edges_u_arr) > 0:
        G.add_edges_from(zip(edges_u_arr, edges_v_arr))
        
    return G

def is_domain_safe(df: pd.DataFrame, rock_type: str, osa: float, geon_mapping: dict) -> bool:
    subset = df[df['RockType'] == rock_type]
    if subset.empty: return True
    min_z = subset['Z'].min()
    for other_rt, other_osa in geon_mapping.items():
        if other_osa > osa:
            other_subset = df[df['RockType'] == other_rt]
            if not other_subset.empty and other_subset['Z'].max() >= min_z:
                return False
    return True

def build_precedence_graph_geon(
    df: pd.DataFrame,
    geon_mapping: dict,
    backend: Optional[str] = None
) -> Union[CompactGraph, nx.DiGraph]:
    import time
    t_start = time.time()
    b = _resolve_backend(backend)

    missing_rock_types = [
        rock_type
        for rock_type in pd.unique(df['RockType'])
        if rock_type not in geon_mapping
    ]
    if missing_rock_types:
        missing_names = ", ".join(repr(rock_type) for rock_type in missing_rock_types)
        raise ValueError(f"GEON mapping is missing RockType entries: {missing_names}.")
    
    is_reg, dx, dy, dz = is_regular_grid(df)
    if not is_reg:
        raise ValueError("GEON mode requires a regular grid; the input grid is non-regular.")

    min_x, min_y, min_z = df['X'].min(), df['Y'].min(), df['Z'].min()
    
    df_idx = np.round((df['X'].values - min_x) / dx).astype(int)
    df_idy = np.round((df['Y'].values - min_y) / dy).astype(int)
    df_idz = np.round((df['Z'].values - min_z) / dz).astype(int)
    
    nx_cells = df_idx.max() + 1
    ny_cells = df_idy.max() + 1
    nz_cells = df_idz.max() + 1
    
    grid = np.full((nx_cells, ny_cells, nz_cells), -1, dtype=np.int32)
    node_indices = np.arange(len(df), dtype=np.int32)
    grid[df_idx, df_idy, df_idz] = node_indices
    
    edges_u = []
    edges_v = []
    
    exact_edges = 0
    MAX_EDGES = 400_000_000  # ~3.2 GB RAM untuk edge arrays (int32 u+v)

    
    t_off_0 = time.time()
    for rock_type, osa in geon_mapping.items():
        safe = is_domain_safe(df, rock_type, osa, geon_mapping)
        cache_key = (round(dx, 4), round(dy, 4), round(dz, 4), round(osa, 4), nz_cells, str(None))
        
        if cache_key in _OFFSET_CACHE:
            full_offsets, reduced_offsets = _OFFSET_CACHE[cache_key]
        else:
            full_offsets = get_offsets(dx, dy, dz, osa, nz_cells, None)
            reduced_offsets = transitive_reduction(full_offsets)
            _OFFSET_CACHE[cache_key] = (full_offsets, reduced_offsets)
            
        offsets_to_use = reduced_offsets if safe else full_offsets
        
        subset_mask = (df['RockType'] == rock_type).values
        if not subset_mask.any():
            continue
            
        subset_idx = df_idx[subset_mask]
        subset_idy = df_idy[subset_mask]
        subset_idz = df_idz[subset_mask]
        
        rt_grid = np.full((nx_cells, ny_cells, nz_cells), False, dtype=bool)
        rt_grid[subset_idx, subset_idy, subset_idz] = True
        
        # STEP B & C: Vectorized candidate lookup & Union
        for (di, dj, dk) in offsets_to_use:
            src_i_start = max(0, -di)
            src_i_end = min(nx_cells, nx_cells - di)
            src_j_start = max(0, -dj)
            src_j_end = min(ny_cells, ny_cells - dj)
            src_k_start = max(0, -dk)
            src_k_end = min(nz_cells, nz_cells - dk)
            
            dst_i_start = max(0, di)
            dst_i_end = min(nx_cells, nx_cells + di)
            dst_j_start = max(0, dj)
            dst_j_end = min(ny_cells, ny_cells + dj)
            dst_k_start = max(0, dk)
            dst_k_end = min(nz_cells, nz_cells + dk)
            
            if src_i_start >= src_i_end or src_j_start >= src_j_end or src_k_start >= src_k_end:
                continue
                
            src_slice = grid[src_i_start:src_i_end, src_j_start:src_j_end, src_k_start:src_k_end]
            dst_slice = grid[dst_i_start:dst_i_end, dst_j_start:dst_j_end, dst_k_start:dst_k_end]
            rt_slice  = rt_grid[src_i_start:src_i_end, src_j_start:src_j_end, src_k_start:src_k_end]
            
            valid_mask = rt_slice & (dst_slice != -1)
            
            u_vals = src_slice[valid_mask]
            v_vals = dst_slice[valid_mask]
            
            if len(u_vals) > 0:
                edges_u.append(u_vals)
                edges_v.append(v_vals)
                exact_edges += len(u_vals)
                
                if exact_edges > MAX_EDGES:
                    raise ValueError(f"Jumlah edge melebihi batas {MAX_EDGES} di GEON Mode.")
                
    t_off_1 = time.time()
    
    if not edges_u:
        edges_u_arr = np.array([], dtype=np.int32)
        edges_v_arr = np.array([], dtype=np.int32)
    else:
        edges_u_arr = np.concatenate(edges_u)
        edges_v_arr = np.concatenate(edges_v)
        
    # Remove self loops
    valid_edges = edges_u_arr != edges_v_arr
    edges_u_arr = edges_u_arr[valid_edges]
    edges_v_arr = edges_v_arr[valid_edges]
        
    t_end = time.time()

    if b == "compact":
        if len(df) < 5000 and len(edges_u_arr) > 0:
            try:
                G_temp = nx.DiGraph()
                G_temp.add_nodes_from(node_indices.tolist())
                G_temp.add_edges_from(zip(edges_u_arr.tolist(), edges_v_arr.tolist()))
                G_tr = nx.transitive_reduction(G_temp)
                G_compact = CompactGraph.from_networkx(G_tr)
                print(f"[GEON Builder] Domains: {len(geon_mapping)}, Edges: {G_compact.number_of_edges()}, Runtime: {t_end - t_start:.2f}s (CompactGraph with small-graph TR)")
                return G_compact
            except Exception:
                pass
        G_compact = CompactGraph(edges_u_arr, edges_v_arr, num_nodes=len(df), node_indices=node_indices)
        print(f"[GEON Builder] Domains: {len(geon_mapping)}, Edges: {G_compact.number_of_edges()}, Runtime: {t_end - t_start:.2f}s (CompactGraph)")
        return G_compact

    G = nx.DiGraph()
    bevs = df['BEV'].values
    xs = df['X'].values
    ys = df['Y'].values
    zs = df['Z'].values
    idx = node_indices
    for i, real_i in enumerate(idx):
        G.add_node(real_i, bev=bevs[i], x=xs[i], y=ys[i], z=zs[i])
        
    if len(edges_u_arr) > 0:
        G.add_edges_from(zip(edges_u_arr, edges_v_arr))
        
    # STEP D: GRAPH-LEVEL REDUNDANCY REDUCTION
    # Only use nx.transitive_reduction for small graphs due to performance
    if len(G.nodes) < 5000:
        try:
            G_tr = nx.transitive_reduction(G)
            G_tr.add_nodes_from(G.nodes(data=True))
            G = G_tr
        except Exception:
            pass
            
    print(f"[GEON Builder] Domains: {len(geon_mapping)}, Edges: {G.number_of_edges()}, Runtime: {t_end - t_start:.2f}s (NetworkX)")
    return G

def build_precedence_graph(
    df: pd.DataFrame,
    osa: float = None,
    geon_mapping: dict = None,
    osa_by_azimuth=None,
    backend: Optional[str] = None
) -> Union[CompactGraph, nx.DiGraph]:
    if geon_mapping:
        return build_precedence_graph_geon(df, geon_mapping, backend=backend)
    else:
        if osa is None:
            osa = 45.0
        return build_precedence_graph_global_osa(df, osa, osa_by_azimuth, backend=backend)
