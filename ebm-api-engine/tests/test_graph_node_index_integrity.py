import os
import sys
import unittest

import networkx as nx
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.compact_graph import CompactGraph
from core.graph_builder import build_precedence_graph, is_regular_grid
from core.pit_optimizer import optimize_pit


class GraphNodeIndexIntegrityTests(unittest.TestCase):
    @staticmethod
    def make_block_model():
        rows = []
        for z in range(3):
            for y in range(3):
                for x in range(3):
                    rows.append({
                        "X": 10 * x,
                        "Y": 10 * y,
                        "Z": 10 * z,
                        "BEV": 1000.0 if (x, y, z) == (1, 1, 0) else -1.0,
                        "RockType": "Rock",
                    })
        return pd.DataFrame(rows)

    @staticmethod
    def expected_pit():
        return {
            (x * 10, y * 10, z * 10)
            for z in range(3)
            for y in range(3)
            for x in range(3)
            if (z == 0 and (x, y) == (1, 1))
            or (z > 0 and np.hypot(x * 10 - 10, y * 10 - 10) <= z * 10 + 1e-9)
        }

    def test_index_labels_do_not_change_physical_pit_or_objective(self):
        variants = {}

        range_index = self.make_block_model()
        variants["range"] = range_index

        nonzero_index = range_index.copy()
        nonzero_index.index = range(100, 100 + len(nonzero_index))
        variants["nonzero"] = nonzero_index

        variants["shuffled"] = range_index.sample(frac=1, random_state=7)

        string_index = range_index.copy()
        string_index.index = [f"block-{i}" for i in range(len(string_index))]
        variants["string"] = string_index

        expected_blocks = self.expected_pit()
        expected_objective = 1000.0 - (len(expected_blocks) - 1)

        for variant, frame in variants.items():
            backend_results = {}
            with self.subTest(index=variant):
                for backend in ("compact", "networkx"):
                    graph = build_precedence_graph(frame, osa=45.0, backend=backend)
                    self.assertEqual(set(graph.nodes()), set(range(len(frame))))

                    result = optimize_pit(frame, graph)
                    selected = result.loc[result["MINED_STATUS"] == 1]
                    selected_blocks = set(
                        map(tuple, selected[["X", "Y", "Z"]].to_numpy())
                    )
                    objective = float(selected["BEV"].sum())

                    self.assertEqual(selected_blocks, expected_blocks)
                    self.assertEqual(objective, expected_objective)
                    self.assertTrue(all(
                        not result.iloc[u]["MINED_STATUS"]
                        or result.iloc[v]["MINED_STATUS"]
                        for u, v in graph.edges()
                    ))
                    backend_results[backend] = (selected_blocks, objective)

                self.assertEqual(backend_results["compact"], backend_results["networkx"])

    def test_geon_builder_uses_row_positions(self):
        for index_kind in ("nonzero", "string"):
            frame = self.make_block_model()
            if index_kind == "nonzero":
                frame.index = range(100, 100 + len(frame))
            else:
                frame.index = [f"block-{i}" for i in range(len(frame))]

            for backend in ("compact", "networkx"):
                with self.subTest(index=index_kind, backend=backend):
                    graph = build_precedence_graph(
                        frame,
                        geon_mapping={"Rock": 45.0},
                        backend=backend,
                    )
                    self.assertEqual(set(graph.nodes()), set(range(len(frame))))

                    result = optimize_pit(frame, graph)
                    selected = result.loc[result["MINED_STATUS"] == 1]
                    self.assertEqual(
                        set(map(tuple, selected[["X", "Y", "Z"]].to_numpy())),
                        self.expected_pit(),
                    )
                    self.assertEqual(float(selected["BEV"].sum()), 986.0)
                    self.assertTrue(all(
                        not result.iloc[u]["MINED_STATUS"]
                        or result.iloc[v]["MINED_STATUS"]
                        for u, v in graph.edges()
                    ))

    @staticmethod
    def expected_pit_positions(graph):
        graph_view = graph.to_networkx() if isinstance(graph, CompactGraph) else graph
        root = 1 * 3 + 1
        return {root, *nx.descendants(graph_view, root)}

    def test_nonregular_global_fallback_uses_row_positions(self):
        frame = self.make_block_model()
        frame["X"] = frame["X"].astype(float)
        frame.loc[0, "X"] = 0.5
        self.assertFalse(is_regular_grid(frame)[0])
        frame.index = [f"block-{i}" for i in range(len(frame))]

        for backend in ("compact", "networkx"):
            with self.subTest(backend=backend):
                graph = build_precedence_graph(frame, osa=45.0, backend=backend)
                self.assertEqual(set(graph.nodes()), set(range(len(frame))))

                result = optimize_pit(frame, graph)
                selected = result.loc[result["MINED_STATUS"] == 1]
                self.assertEqual(
                    set(map(tuple, selected[["X", "Y", "Z"]].to_numpy())),
                    self.expected_pit(),
                )
                self.assertEqual(float(selected["BEV"].sum()), 986.0)
                self.assertTrue(all(
                    not result.iloc[u]["MINED_STATUS"]
                    or result.iloc[v]["MINED_STATUS"]
                    for u, v in graph.edges()
                ))

    def test_optimizer_rejects_graph_ids_outside_row_positions(self):
        frame = self.make_block_model()
        invalid_graphs = (
            nx.DiGraph([(0, len(frame) + 2)]),
            CompactGraph(
                np.array([0], dtype=np.int32),
                np.array([len(frame) + 2], dtype=np.int32),
                num_nodes=len(frame),
                node_indices=np.arange(len(frame), dtype=np.int32),
            ),
        )

        for graph in invalid_graphs:
            with self.subTest(graph=type(graph).__name__):
                with self.assertRaisesRegex(ValueError, "row positions"):
                    optimize_pit(frame, graph)


if __name__ == "__main__":
    unittest.main()