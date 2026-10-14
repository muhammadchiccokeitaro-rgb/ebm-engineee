import pytest
import pandas as pd
import networkx as nx
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

def make_dummy_grid(nx_c=5, ny_c=5, nz_c=5) -> pd.DataFrame:
    rows = []
    idx = 0
    for z in range(nz_c):
        for y in range(ny_c):
            for x in range(nx_c):
                rows.append({
                    "X": x*10, "Y": y*10, "Z": z*10,
                    "DX": 10, "DY": 10, "DZ": 10,
                    "RockType": "SemuaRockType",
                    "Grade": 1.0,
                    "Density": 2.5,
                    "BEV": 100.0
                })
                idx += 1
    return pd.DataFrame(rows)


def test_single_domain_equivalence():
    from core.graph_builder import build_precedence_graph
    
    df = make_dummy_grid(5, 5, 5)
    
    G_global = build_precedence_graph(df, osa=45.0)
    mapping = {"SemuaRockType": 45.0}
    G_geon = build_precedence_graph(df, geon_mapping=mapping)
    
    nodes_global = G_global.number_of_nodes()
    nodes_geon = G_geon.number_of_nodes()
    assert nodes_global == nodes_geon, f"Jumlah Node berbeda: Global={nodes_global}, GEON={nodes_geon}"
    
    edges_global_count = G_global.number_of_edges()
    edges_geon_count = G_geon.number_of_edges()
    assert edges_global_count == edges_geon_count, f"Jumlah Edge berbeda: Global={edges_global_count}, GEON={edges_geon_count}"
    
    edges_global = set(G_global.edges())
    edges_geon = set(G_geon.edges())
    assert edges_global == edges_geon, "Himpunan edges tidak 100% identik!"
    print(f"\n[LULUS] Single Domain Equivalence Test: Graf GEON dan Global identik (Nodes: {nodes_global}, Edges: {edges_global_count})")

def test_multi_domain_valid_dag():
    from core.graph_builder import build_precedence_graph
    
    df = make_dummy_grid(5, 5, 5)
    
    df.loc[df['Z'] < 20, 'RockType'] = "Bedrock"
    df.loc[df['Z'] == 20, 'RockType'] = "Saprolite"
    df.loc[df['Z'] > 20, 'RockType'] = "Limonite"
    
    mapping = {
        "Bedrock": 60.0,
        "Saprolite": 45.0,
        "Limonite": 35.0
    }
    
    G = build_precedence_graph(df, geon_mapping=mapping)
    
    assert G.number_of_edges() > 0, "Graph tidak memiliki edge!"
    for u, v in G.edges():
        assert u != v, "Terdeteksi self loop!"
        assert u in G.nodes, f"Node asal {u} tidak valid!"
        assert v in G.nodes, f"Node tujuan {v} tidak valid!"
        
    assert nx.is_directed_acyclic_graph(G), "Graph memiliki siklus (bukan DAG)!"
    assert G.number_of_nodes() == len(df), "Ada node yang hilang dari graf!"
    print(f"\n[LULUS] Multi-Domain Valid DAG Test (Nodes: {G.number_of_nodes()}, Edges: {G.number_of_edges()})")

def test_regression_mapping():
    from core.graph_builder import build_precedence_graph
    
    df = make_dummy_grid(5, 5, 5)
    df.loc[df['Z'] < 20, 'RockType'] = "Bedrock"
    df.loc[df['Z'] == 20, 'RockType'] = "Saprolite"
    df.loc[df['Z'] > 20, 'RockType'] = "Limonite"
    
    mapping = {
        "Bedrock": 45.0,
        "Saprolite": 45.0,
        "Limonite": 45.0
    }
    
    G_geon = build_precedence_graph(df, geon_mapping=mapping)
    G_global = build_precedence_graph(df, osa=45.0)
    
    assert G_geon.number_of_nodes() == G_global.number_of_nodes()
    assert G_geon.number_of_edges() == G_global.number_of_edges()
    
    edges_geon = set(G_geon.edges())
    edges_global = set(G_global.edges())
    assert edges_geon == edges_global
    print("\n[LULUS] Regression Test Homogeneous Mapping == Global OSA")

def test_geon_reference_closure():
    from core.graph_builder import is_regular_grid, get_offsets, build_precedence_graph_geon
    import numpy as np

    def build_geon_reference(df, geon_mapping):
        is_reg, dx, dy, dz = is_regular_grid(df)
        min_x, min_y, min_z = df['X'].min(), df['Y'].min(), df['Z'].min()
        df_idx = np.round((df['X'].values - min_x) / dx).astype(int)
        df_idy = np.round((df['Y'].values - min_y) / dy).astype(int)
        df_idz = np.round((df['Z'].values - min_z) / dz).astype(int)
        nx_cells, ny_cells, nz_cells = df_idx.max() + 1, df_idy.max() + 1, df_idz.max() + 1
        grid = np.full((nx_cells, ny_cells, nz_cells), -1, dtype=np.int32)
        grid[df_idx, df_idy, df_idz] = df.index.values.astype(np.int32)
        edges_u, edges_v = [], []
        
        for rock_type, osa in geon_mapping.items():
            full_offsets = get_offsets(dx, dy, dz, osa, nz_cells, None)
            subset_mask = (df['RockType'] == rock_type).values
            if not subset_mask.any(): continue
            rt_grid = np.full((nx_cells, ny_cells, nz_cells), False, dtype=bool)
            rt_grid[df_idx[subset_mask], df_idy[subset_mask], df_idz[subset_mask]] = True
            
            for (di, dj, dk) in full_offsets:
                src_i_start, src_i_end = max(0, -di), min(nx_cells, nx_cells - di)
                src_j_start, src_j_end = max(0, -dj), min(ny_cells, ny_cells - dj)
                src_k_start, src_k_end = max(0, -dk), min(nz_cells, nz_cells - dk)
                dst_i_start, dst_i_end = max(0, di), min(nx_cells, nx_cells + di)
                dst_j_start, dst_j_end = max(0, dj), min(ny_cells, ny_cells + dj)
                dst_k_start, dst_k_end = max(0, dk), min(nz_cells, nz_cells + dk)
                if src_i_start >= src_i_end or src_j_start >= src_j_end or src_k_start >= src_k_end: continue
                src_slice = grid[src_i_start:src_i_end, src_j_start:src_j_end, src_k_start:src_k_end]
                dst_slice = grid[dst_i_start:dst_i_end, dst_j_start:dst_j_end, dst_k_start:dst_k_end]
                rt_slice  = rt_grid[src_i_start:src_i_end, src_j_start:src_j_end, src_k_start:src_k_end]
                valid_mask = rt_slice & (dst_slice != -1)
                u_vals, v_vals = src_slice[valid_mask], dst_slice[valid_mask]
                if len(u_vals) > 0:
                    edges_u.append(u_vals)
                    edges_v.append(v_vals)
                    
        edges_u_arr = np.concatenate(edges_u) if edges_u else np.array([], dtype=np.int32)
        edges_v_arr = np.concatenate(edges_v) if edges_v else np.array([], dtype=np.int32)
        valid_edges = edges_u_arr != edges_v_arr
        edges_u_arr, edges_v_arr = edges_u_arr[valid_edges], edges_v_arr[valid_edges]
            
        G = nx.DiGraph()
        G.add_nodes_from(df.index)
        if len(edges_u_arr) > 0:
            G.add_edges_from(zip(edges_u_arr, edges_v_arr))
        return G

    def make_grid():
        rows = []
        for z in range(6):
            for y in range(9):
                for x in range(9):
                    rows.append({
                        "X": x*10, "Y": y*10, "Z": z*5,
                        "DX": 10, "DY": 10, "DZ": 5,
                        "Grade": 1.0, "Density": 2.5, "BEV": 100.0,
                        "RockType": "Weak"
                    })
        return pd.DataFrame(rows)

    def count_diffs(df, mapping):
        G_ref = build_geon_reference(df, mapping)
        G_geon = build_precedence_graph_geon(df, mapping)
        return sum(1 for node in df.index if nx.ancestors(G_ref, node) != nx.ancestors(G_geon, node))

    mapping = {"Weak": 30.0, "Strong": 60.0}

    df1 = make_grid()
    df1.loc[df1['Z'] >= 15, 'RockType'] = "Weak"
    df1.loc[df1['Z'] < 15, 'RockType'] = "Strong"
    assert count_diffs(df1, mapping) == 0

    df2 = make_grid()
    df2.loc[df2['Z'] >= 15, 'RockType'] = "Strong"
    df2.loc[df2['Z'] < 15, 'RockType'] = "Weak"
    assert count_diffs(df2, mapping) == 0

    df3 = make_grid()
    df3.loc[(df3['Z'] == 10) & (df3['X'] >= 30) & (df3['X'] <= 50) & (df3['Y'] >= 30) & (df3['Y'] <= 50), 'RockType'] = "Strong"
    assert count_diffs(df3, mapping) == 0

    np.random.seed(42)
    df4 = make_grid()
    df4['RockType'] = np.random.choice(["Weak", "Strong"], size=len(df4))
    assert count_diffs(df4, mapping) == 0

    print("\n[LULUS] GEON Reference Closure Test (Fallback mechanism applies to unsafe layouts)")

if __name__ == "__main__":
    sys.exit(pytest.main(["-v", "-s", __file__]))
