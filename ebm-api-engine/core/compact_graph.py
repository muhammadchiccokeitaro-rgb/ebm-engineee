"""
================================================================================
  COMPACT GRAPH - High-Performance Zero-Copy Precedence Graph for EBM Engine
================================================================================
  Mewakili graf presedensi penambangan terarah (DAG) secara kompak dan efisien
  menggunakan array NumPy 1D kontigu berdaya simpan rendah (int32) alih-alih
  struktur kamus/objek per-node/per-edge NetworkX.

  Keunggulan Arsitektur:
  - Zero Python-object overhead untuk jutaan edge.
  - Alokasi memori datar (flat contiguous memory) O(E) vs O(V + E) pointer table.
  - Integrasi langsung tanpa salinan ke solver SciPy sparse (COO/CSR).
  - Dual-interface callable & iterable untuk .nodes dan .edges (100% kompatibel NetworkX).
================================================================================
"""

import os
import numpy as np
import scipy.sparse as sp
from typing import Optional, Union, Tuple, Iterator, Iterable, Any, Set
import networkx as nx

# Global Default Backend Configuration
DEFAULT_GRAPH_BACKEND: str = os.environ.get("EBM_GRAPH_BACKEND", "compact").lower()


class NodeView:
    """Tampilan node yang kompatibel baik sebagai iterable maupun callable (mirip NetworkX)."""
    __slots__ = ('_num_nodes', '_node_indices')

    def __init__(self, num_nodes: int, node_indices: Optional[np.ndarray] = None):
        self._num_nodes = num_nodes
        self._node_indices = node_indices

    def __len__(self) -> int:
        return self._num_nodes

    def __iter__(self) -> Iterator[int]:
        if self._node_indices is not None:
            for idx in self._node_indices:
                yield int(idx)
        else:
            for i in range(self._num_nodes):
                yield i

    def __contains__(self, item: Any) -> bool:
        if self._node_indices is not None:
            return item in self._node_indices
        try:
            val = int(item)
            return 0 <= val < self._num_nodes
        except (ValueError, TypeError):
            return False

    def __call__(self, data: bool = False) -> Union[list, Iterator]:
        if data:
            return [(n, {}) for n in self]
        return list(self)

    def __repr__(self) -> str:
        return f"NodeView({self._num_nodes} nodes)"


class EdgeView:
    """Tampilan edge yang kompatibel baik sebagai iterable maupun callable (mirip NetworkX)."""
    __slots__ = ('_u', '_v')

    def __init__(self, u: np.ndarray, v: np.ndarray):
        self._u = u
        self._v = v

    def __len__(self) -> int:
        return len(self._u)

    def __iter__(self) -> Iterator[Tuple[int, int]]:
        u_arr = self._u
        v_arr = self._v
        for i in range(len(u_arr)):
            yield (int(u_arr[i]), int(v_arr[i]))

    def __call__(self, data: bool = False) -> Iterator:
        u_arr = self._u
        v_arr = self._v
        if data:
            for i in range(len(u_arr)):
                yield (int(u_arr[i]), int(v_arr[i]), {})
        else:
            for i in range(len(u_arr)):
                yield (int(u_arr[i]), int(v_arr[i]))

    def __repr__(self) -> str:
        return f"EdgeView({len(self._u)} edges)"


class CompactGraph:
    """
    Struktur graf presedensi kompak berbasis array 1D NumPy kontigu.
    
    Menyimpan edge terarah u -> v di mana:
    - u: indeks blok penambangan (source)
    - v: indeks blok pendahulu di atasnya (target / dependency)
    """

    __slots__ = ('_u', '_v', '_num_nodes', '_node_indices', 'nodes', 'edges', '_csr_cache')

    def __init__(
        self,
        u: Union[np.ndarray, Iterable[int]],
        v: Union[np.ndarray, Iterable[int]],
        num_nodes: Optional[int] = None,
        node_indices: Optional[np.ndarray] = None
    ):
        # 1. Normalisasi u & v ke array int32 1D kontigu
        if isinstance(u, np.ndarray):
            self._u = np.ascontiguousarray(u, dtype=np.int32)
        else:
            self._u = np.array(list(u), dtype=np.int32)

        if isinstance(v, np.ndarray):
            self._v = np.ascontiguousarray(v, dtype=np.int32)
        else:
            self._v = np.array(list(v), dtype=np.int32)

        if self._u.ndim != 1 or self._v.ndim != 1:
            raise ValueError("Array u dan v harus berdimensi 1 (1D arrays).")

        if len(self._u) != len(self._v):
            raise ValueError(f"Panjang array u ({len(self._u)}) dan v ({len(self._v)}) tidak cocok.")

        # 2. Hitung jumlah node
        if num_nodes is not None:
            self._num_nodes = int(num_nodes)
        else:
            max_u = int(self._u.max()) if len(self._u) > 0 else -1
            max_v = int(self._v.max()) if len(self._v) > 0 else -1
            self._num_nodes = max(max_u, max_v) + 1

        # 3. Node indices
        if node_indices is not None:
            self._node_indices = np.ascontiguousarray(node_indices, dtype=np.int32)
        else:
            self._node_indices = None

        self.nodes = NodeView(self._num_nodes, self._node_indices)
        self.edges = EdgeView(self._u, self._v)
        self._csr_cache: Optional[sp.csr_matrix] = None

    @property
    def u(self) -> np.ndarray:
        """Array 1D int32 source nodes."""
        return self._u

    @property
    def v(self) -> np.ndarray:
        """Array 1D int32 target nodes."""
        return self._v

    @property
    def num_nodes(self) -> int:
        """Jumlah total node."""
        return self._num_nodes

    @property
    def num_edges(self) -> int:
        """Jumlah total edge."""
        return len(self._u)

    def number_of_nodes(self) -> int:
        """Kompatibilitas NetworkX: mengembalikan jumlah node."""
        return self._num_nodes

    def number_of_edges(self) -> int:
        """Kompatibilitas NetworkX: mengembalikan jumlah edge."""
        return len(self._u)

    def is_directed(self) -> bool:
        return True

    def is_multigraph(self) -> bool:
        return False

    def degree(self, node=None):
        """Kompatibilitas NetworkX: in_degree + out_degree."""
        if node is not None:
            out_d = int(np.sum(self._u == node))
            in_d = int(np.sum(self._v == node))
            return out_d + in_d
        return [(n, int(np.sum(self._u == n)) + int(np.sum(self._v == n))) for n in self.nodes]

    def in_degree(self, node=None):
        """Kompatibilitas NetworkX: hitung derajat masuk."""
        if node is not None:
            return int(np.sum(self._v == node))
        return [(n, int(np.sum(self._v == n))) for n in self.nodes]

    def out_degree(self, node=None):
        """Kompatibilitas NetworkX: hitung derajat keluar."""
        if node is not None:
            return int(np.sum(self._u == node))
        return [(n, int(np.sum(self._u == n))) for n in self.nodes]

    def __len__(self) -> int:
        return self._num_nodes

    def __contains__(self, n: Any) -> bool:
        return n in self.nodes

    def successors(self, n: int) -> Iterator[int]:
        """Mengembalikan iterator tetangga keluar (target pendahulu v dari n)."""
        idx = np.where(self._u == n)[0]
        for target in self._v[idx]:
            yield int(target)

    def neighbors(self, n: int) -> Iterator[int]:
        """Kompatibilitas traversal NetworkX: alias untuk successors."""
        return self.successors(n)

    def predecessors(self, n: int) -> Iterator[int]:
        """Mengembalikan iterator tetangga masuk (source blok u yang mensyaratkan n)."""
        idx = np.where(self._v == n)[0]
        for src in self._u[idx]:
            yield int(src)

    def has_edge(self, u: int, v: int) -> bool:
        idx = np.where(self._u == u)[0]
        return bool((self._v[idx] == v).any())

    def to_networkx(self) -> nx.DiGraph:
        """
        Konversi CompactGraph ke NetworkX DiGraph.
        Berguna untuk fallback pengujian atau algoritma spesifik NetworkX.
        """
        G = nx.DiGraph()
        if self._node_indices is not None:
            G.add_nodes_from(self._node_indices.tolist())
        else:
            G.add_nodes_from(range(self._num_nodes))

        if len(self._u) > 0:
            G.add_edges_from(zip(self._u.tolist(), self._v.tolist()))
        return G

    @classmethod
    def from_networkx(cls, G: nx.DiGraph) -> 'CompactGraph':
        """
        Konstruksi CompactGraph dari NetworkX DiGraph.
        """
        num_nodes = G.number_of_nodes()
        if G.number_of_edges() == 0:
            return cls(
                u=np.array([], dtype=np.int32),
                v=np.array([], dtype=np.int32),
                num_nodes=num_nodes,
                node_indices=np.array(list(G.nodes()), dtype=np.int32) if num_nodes > 0 else None
            )

        edge_list = list(G.edges())
        u = np.array([e[0] for e in edge_list], dtype=np.int32)
        v = np.array([e[1] for e in edge_list], dtype=np.int32)
        return cls(
            u=u,
            v=v,
            num_nodes=num_nodes,
            node_indices=np.array(list(G.nodes()), dtype=np.int32)
        )

    @classmethod
    def from_arrays(
        cls,
        u: np.ndarray,
        v: np.ndarray,
        num_nodes: Optional[int] = None,
        node_indices: Optional[np.ndarray] = None
    ) -> 'CompactGraph':
        """
        Pabrik instansiasi langsung dari array NumPy tanpa konversi perantara.
        """
        return cls(u=u, v=v, num_nodes=num_nodes, node_indices=node_indices)

    def to_csr(self, data: Optional[np.ndarray] = None, shape: Optional[Tuple[int, int]] = None) -> sp.csr_matrix:
        """
        Konversi langsung ke Scipy CSR Matrix.
        """
        n = self._num_nodes
        mat_shape = shape if shape is not None else (n, n)
        if len(self._u) == 0:
            return sp.csr_matrix(mat_shape, dtype=np.int32)

        if data is None:
            data = np.ones(len(self._u), dtype=np.int32)
        else:
            data = np.ascontiguousarray(data)

        coo = sp.coo_matrix((data, (self._u, self._v)), shape=mat_shape, dtype=data.dtype)
        return coo.tocsr()

    def nbytes(self) -> int:
        """
        Mengembalikan total alokasi memori murni (dalam byte) dari array-array internal.
        """
        total = self._u.nbytes + self._v.nbytes
        if self._node_indices is not None:
            total += self._node_indices.nbytes
        return total

    def __repr__(self) -> str:
        return f"<CompactGraph: {self._num_nodes} nodes, {len(self._u)} edges, {self.nbytes() / (1024*1024):.2f} MB>"
