import sys
import os
import pandas as pd
import numpy as np
import networkx as nx

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from core.graph_builder import get_offsets, is_regular_grid, build_precedence_graph_geon

def build_geon_reference(df: pd.DataFrame, geon_mapping: dict) -> nx.DiGraph:
    is_reg, dx, dy, dz = is_regular_grid(df)
    min_x, min_y, min_z = df['X'].min(), df['Y'].min(), df['Z'].min()
    
    df_idx = np.round((df['X'].values - min_x) / dx).astype(int)
    df_idy = np.round((df['Y'].values - min_y) / dy).astype(int)
    df_idz = np.round((df['Z'].values - min_z) / dz).astype(int)
    
    nx_cells = df_idx.max() + 1
    ny_cells = df_idy.max() + 1
    nz_cells = df_idz.max() + 1
    
    grid = np.full((nx_cells, ny_cells, nz_cells), -1, dtype=np.int32)
    node_indices = df.index.values.astype(np.int32)
    grid[df_idx, df_idy, df_idz] = node_indices
    
    edges_u = []
    edges_v = []
    
    for rock_type, osa in geon_mapping.items():
        # NO REDUCTION
        full_offsets = get_offsets(dx, dy, dz, osa, nz_cells, None)
        
        subset_mask = (df['RockType'] == rock_type).values
        if not subset_mask.any():
            continue
            
        subset_idx = df_idx[subset_mask]
        subset_idy = df_idy[subset_mask]
        subset_idz = df_idz[subset_mask]
        
        rt_grid = np.full((nx_cells, ny_cells, nz_cells), False, dtype=bool)
        rt_grid[subset_idx, subset_idy, subset_idz] = True
        
        for (di, dj, dk) in full_offsets:
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
                
    edges_u_arr = np.concatenate(edges_u) if edges_u else np.array([], dtype=np.int32)
    edges_v_arr = np.concatenate(edges_v) if edges_v else np.array([], dtype=np.int32)
    valid_edges = edges_u_arr != edges_v_arr
    edges_u_arr = edges_u_arr[valid_edges]
    edges_v_arr = edges_v_arr[valid_edges]
        
    G = nx.DiGraph()
    bevs = df['BEV'].values
    xs = df['X'].values
    ys = df['Y'].values
    zs = df['Z'].values
    idx = df.index.values
    for i, real_i in enumerate(idx):
        G.add_node(real_i, bev=bevs[i], x=xs[i], y=ys[i], z=zs[i])
        
    if len(edges_u_arr) > 0:
        G.add_edges_from(zip(edges_u_arr, edges_v_arr))
        
    return G

def make_grid(nx_c=9, ny_c=9, nz_c=6, dx=10, dz=5):
    rows = []
    for z in range(nz_c):
        for y in range(ny_c):
            for x in range(nx_c):
                rows.append({
                    "X": x*dx, "Y": y*dx, "Z": z*dz,
                    "DX": dx, "DY": dx, "DZ": dz,
                    "Grade": 1.0, "Density": 2.5, "BEV": 100.0,
                    "RockType": "Weak" # default
                })
    return pd.DataFrame(rows)

def is_domain_safe(df, rock_type, osa, geon_mapping):
    subset = df[df['RockType'] == rock_type]
    if subset.empty: return True
    min_z = subset['Z'].min()
    for other_rt, other_osa in geon_mapping.items():
        if other_osa > osa:
            other_subset = df[df['RockType'] == other_rt]
            if not other_subset.empty and other_subset['Z'].max() >= min_z:
                return False
    return True

def compare_closures(df, mapping):
    G_ref = build_geon_reference(df, mapping)
    
    # Simulate build_precedence_graph_geon with fallback
    # But since we can't easily redefine it here without copying all code, let's just copy the GEON builder logic here for test.
    is_reg, dx, dy, dz = is_regular_grid(df)
    min_x, min_y, min_z = df['X'].min(), df['Y'].min(), df['Z'].min()
    
    df_idx = np.round((df['X'].values - min_x) / dx).astype(int)
    df_idy = np.round((df['Y'].values - min_y) / dy).astype(int)
    df_idz = np.round((df['Z'].values - min_z) / dz).astype(int)
    
    nx_cells = df_idx.max() + 1
    ny_cells = df_idy.max() + 1
    nz_cells = df_idz.max() + 1
    
    grid = np.full((nx_cells, ny_cells, nz_cells), -1, dtype=np.int32)
    node_indices = df.index.values.astype(np.int32)
    grid[df_idx, df_idy, df_idz] = node_indices
    
    edges_u = []
    edges_v = []
    
    for rock_type, osa in mapping.items():
        safe = is_domain_safe(df, rock_type, osa, mapping)
        if safe:
            from core.graph_builder import transitive_reduction
            offsets = transitive_reduction(get_offsets(dx, dy, dz, osa, nz_cells, None))
        else:
            offsets = get_offsets(dx, dy, dz, osa, nz_cells, None)
            
        subset_mask = (df['RockType'] == rock_type).values
        if not subset_mask.any():
            continue
            
        subset_idx = df_idx[subset_mask]
        subset_idy = df_idy[subset_mask]
        subset_idz = df_idz[subset_mask]
        
        rt_grid = np.full((nx_cells, ny_cells, nz_cells), False, dtype=bool)
        rt_grid[subset_idx, subset_idy, subset_idz] = True
        
        for (di, dj, dk) in offsets:
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
                
    edges_u_arr = np.concatenate(edges_u) if edges_u else np.array([], dtype=np.int32)
    edges_v_arr = np.concatenate(edges_v) if edges_v else np.array([], dtype=np.int32)
    valid_edges = edges_u_arr != edges_v_arr
    edges_u_arr = edges_u_arr[valid_edges]
    edges_v_arr = edges_v_arr[valid_edges]
        
    G_geon = nx.DiGraph()
    G_geon.add_nodes_from(G_ref.nodes(data=True))
    if len(edges_u_arr) > 0:
        G_geon.add_edges_from(zip(edges_u_arr, edges_v_arr))
    
    diff_count = 0
    for node in df.index:
        anc_ref = nx.ancestors(G_ref, node)
        anc_geon = nx.ancestors(G_geon, node)
        if anc_ref != anc_geon:
            diff_count += 1
            
    return diff_count

def run_tests():
    mapping = {"Weak": 30.0, "Strong": 60.0}
    
    # 1. Lemah di atas (Weak on top)
    df1 = make_grid()
    df1.loc[df1['Z'] >= 15, 'RockType'] = "Weak"
    df1.loc[df1['Z'] < 15, 'RockType'] = "Strong"
    print("Lemah di atas:", compare_closures(df1, mapping))
    
    # 2. Kuat di atas (Strong on top)
    df2 = make_grid()
    df2.loc[df2['Z'] >= 15, 'RockType'] = "Strong"
    df2.loc[df2['Z'] < 15, 'RockType'] = "Weak"
    print("Kuat di atas:", compare_closures(df2, mapping))
    
    # 3. Lensa kuat tertanam (Strong lens embedded)
    df3 = make_grid()
    df3['RockType'] = "Weak"
    df3.loc[(df3['Z'] == 10) & (df3['X'] >= 30) & (df3['X'] <= 50) & (df3['Y'] >= 30) & (df3['Y'] <= 50), 'RockType'] = "Strong"
    print("Lensa kuat tertanam:", compare_closures(df3, mapping))
    
    # 4. Acak (Random)
    np.random.seed(42)
    df4 = make_grid()
    df4['RockType'] = np.random.choice(["Weak", "Strong"], size=len(df4))
    print("Acak:", compare_closures(df4, mapping))

if __name__ == "__main__":
    run_tests()
