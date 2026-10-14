import networkx as nx
import pandas as pd
import numpy as np
import scipy.sparse as sp
import scipy.sparse.csgraph as cs

def _validate_graph_node_ids(G, num_nodes: int) -> None:
    def validate(node_id) -> None:
        if (
            isinstance(node_id, (bool, np.bool_))
            or not isinstance(node_id, (int, np.integer))
            or node_id < 0
            or node_id >= num_nodes
        ):
            raise ValueError(
                f"Graph node IDs must be integer row positions in [0, {num_nodes}); "
                f"got {node_id!r}."
            )

    for node_id in G.nodes:
        validate(node_id)

    if hasattr(G, 'u') and hasattr(G, 'v') and isinstance(G.u, np.ndarray):
        for node_ids in (G.u, G.v):
            if node_ids.size and (np.any(node_ids < 0) or np.any(node_ids >= num_nodes)):
                invalid_id = node_ids[(node_ids < 0) | (node_ids >= num_nodes)][0]
                validate(int(invalid_id))


def optimize_pit(df: pd.DataFrame, G: nx.DiGraph, return_meta: bool = False):
    """
    Fase 3: Pencarian UPL (Maximum Weight Closure via Max-Flow/Min-Cut (scipy.sparse.csgraph.maximum_flow))
    (Catatan: Algoritma Pseudoflow belum diimplementasikan; implementasi saat ini menggunakan Max-Flow/Min-Cut scipy.sparse.csgraph.maximum_flow)
    Graph node IDs must be DataFrame row positions, independent of index labels.

    Optimasi:
    - Menggunakan scipy.sparse.csgraph.maximum_flow (algoritma berbasis C).
    - Membangun CSR matrix secara efisien.
    - Menghindari NetworkX min-cut yang sangat lambat.
    - Autoscaling nilai float ke int32 dengan proteksi overflow.
    """
    df = df.copy()

    bevs = df['BEV'].values
    num_nodes = len(df)
    _validate_graph_node_ids(G, num_nodes)
    source = num_nodes
    sink = num_nodes + 1
    N = num_nodes + 2

    # Clean nan/inf
    bevs_clean = np.nan_to_num(bevs, nan=0.0, posinf=1e9, neginf=-1e9)
    
    # 1. Penskalaan otomatis: target default skala 1000.
    # Kapasitas node masuk int32. Maksimum int32 ~ 2.14 miliar.
    # Kita harus memastikan sum dari positif tidak over 2.14M?
    # maximum_flow scipy menyimpan flow di int32, jadi total max_flow (sum kapasitas source)
    # tidak boleh lebih dari 2.14 miliar.
    pos_sum_float = bevs_clean[bevs_clean > 0].sum()
    
    scale_factor = 1000.0
    # Jika pos_sum_float * scale_factor > 1.5e9, turunkan scale_factor
    if pos_sum_float > 0 and (pos_sum_float * scale_factor) > 1.5e9:
        scale_factor = 1.5e9 / pos_sum_float
        
    autoscale_triggered = bool(scale_factor != 1000.0)
    
    scaled_bevs = np.round(bevs_clean * scale_factor).astype(np.int64)
    n_clipped = int(np.count_nonzero(
        (scaled_bevs < -2000000000) | (scaled_bevs > 2000000000)
    ))
    # Clip ke batas aman (walau seharusnya aman karena sum-nya dijaga)
    scaled_bevs = np.clip(scaled_bevs, -2000000000, 2000000000).astype(np.int32)
    
    pos_sum = scaled_bevs[scaled_bevs > 0].sum()
    # Kapasitas tak terhingga untuk precedence edges
    # Harus lebih besar dari total possible flow, tapi jangan sampai overflow int32
    INF_CAP = int(pos_sum) + 1 if pos_sum > 0 else 1000
    if INF_CAP > 2000000000:
        INF_CAP = 2000000000
        
    pos_mask = scaled_bevs > 0
    neg_mask = scaled_bevs < 0

    pos_idx = np.where(pos_mask)[0]
    neg_idx = np.where(neg_mask)[0]

    if hasattr(G, 'u') and hasattr(G, 'v') and isinstance(G.u, np.ndarray):
        u_edges = G.u
        v_edges = G.v
        num_prec_edges = len(u_edges)
        prec_caps = np.full(num_prec_edges, INF_CAP, dtype=np.int32)

        s_edges_u = np.full(len(pos_idx), source, dtype=np.int32)
        s_edges_v = pos_idx.astype(np.int32)
        s_caps = scaled_bevs[pos_idx]

        t_edges_u = neg_idx.astype(np.int32)
        t_edges_v = np.full(len(neg_idx), sink, dtype=np.int32)
        t_caps = (-scaled_bevs[neg_idx]).astype(np.int32)

        all_u = np.concatenate([s_edges_u, t_edges_u, u_edges])
        all_v = np.concatenate([s_edges_v, t_edges_v, v_edges])
        all_caps = np.concatenate([s_caps, t_caps, prec_caps])
    else:
        u_edges = [u for u, v in G.edges()]
        v_edges = [v for u, v in G.edges()]
        num_prec_edges = len(u_edges)
        prec_caps = [INF_CAP] * num_prec_edges

        s_edges_u = [source] * len(pos_idx)
        s_edges_v = pos_idx.tolist()
        s_caps = scaled_bevs[pos_idx].tolist()

        t_edges_u = neg_idx.tolist()
        t_edges_v = [sink] * len(neg_idx)
        t_caps = (-scaled_bevs[neg_idx]).tolist()

        all_u = s_edges_u + t_edges_u + u_edges
        all_v = s_edges_v + t_edges_v + v_edges
        all_caps = s_caps + t_caps + prec_caps

    prec_edge_start_idx = len(pos_idx) + len(neg_idx)

    graph = sp.coo_matrix((all_caps, (all_u, all_v)), shape=(N, N), dtype=np.int32).tocsr()

    try:
        res = cs.maximum_flow(graph, source, sink)
        
        # 2. Post-check saturasi: pastikan tidak ada precedence edge yang terisi penuh
        if num_prec_edges > 0:
            max_flow_val = res.flow.max()
            if max_flow_val >= INF_CAP:
                raise ValueError("Precedence edge tersaturasi penuh! Indikasi overflow kapasitas int32 di SciPy maximum_flow.")

        resid = graph - res.flow
        resid.eliminate_zeros()
        reachable = cs.depth_first_order(resid, source, directed=True, return_predecessors=False)

        block_nodes = reachable[reachable < num_nodes]

        mined_arr = np.zeros(num_nodes, dtype=np.int8)
        mined_arr[block_nodes] = 1

    except Exception as e:
        print(f"Min-cut error: {e}")
        mined_arr = np.zeros(num_nodes, dtype=np.int8)
        if "tersaturasi" in str(e):
            raise e

    df['MINED_STATUS'] = mined_arr

    if return_meta:
        meta = {
            "autoscale_triggered":  autoscale_triggered,
            "effective_divisor":    1.0 / scale_factor, # to keep consistency with old naming
            "effective_scale":      scale_factor,
            "max_rounding_error_per_block": 0.5 / scale_factor,
            "pos_sum_before_scale": float(pos_sum_float),
            "pos_sum_after_scale":  int(pos_sum),
            "n_clipped":            n_clipped,
        }
        return df, meta

    return df
