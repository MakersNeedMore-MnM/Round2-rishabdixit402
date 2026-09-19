import networkx as nx
from typing import List, Dict, Any, Set

class CodeIntelligenceGraph:
    def __init__(self):
        self.g = nx.DiGraph()

    def build_from_records(self, entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]):
        self.g.clear()

        # Add entities as nodes
        for e in entities:
            node_id = e.get("qualified_name") or f"{e['file_path']}::{e['name']}"
            self.g.add_node(
                node_id,
                id=str(e.get("id", node_id)),
                name=e.get("name", ""),
                type=e.get("type", "Entity"),
                file_path=e.get("file_path", ""),
                line_start=e.get("line_start", 1),
                line_end=e.get("line_end", 1),
                signature=e.get("signature", "")
            )

        # Map simple names to node_ids for easy resolution
        name_to_nodes: Dict[str, List[str]] = {}
        for node_id, data in self.g.nodes(data=True):
            simple_name = data.get("name", "")
            name_to_nodes.setdefault(simple_name, []).append(node_id)
            # also index by short attribute/field name if applicable
            if "." in simple_name:
                short = simple_name.split(".")[-1]
                name_to_nodes.setdefault(short, []).append(node_id)

        # Add edges
        for r in relationships:
            src_name = r.get("source_name", "")
            src_file = r.get("source_file", "")
            tgt_name = r.get("target_name", "")
            edge_type = r.get("type", "references")
            confidence = r.get("confidence", "high")
            snippet = r.get("snippet", "")

            # Resolve source node
            src_candidates = name_to_nodes.get(src_name, [])
            src_node = next((nid for nid in src_candidates if self.g.nodes[nid].get("file_path") == src_file), None)
            if not src_node:
                src_node = f"{src_file}::{src_name}"
                if not self.g.has_node(src_node):
                    self.g.add_node(src_node, name=src_name, type="File" if "::" not in src_node else "Symbol", file_path=src_file)

            # Resolve target node
            tgt_candidates = name_to_nodes.get(tgt_name, [])
            if tgt_candidates:
                for tgt_node in tgt_candidates:
                    self.g.add_edge(
                        src_node, tgt_node,
                        type=edge_type,
                        confidence=confidence,
                        snippet=snippet
                    )
            else:
                # Target outside parsed definitions (e.g. external library, unparsed target)
                tgt_node = f"external::{tgt_name}"
                if not self.g.has_node(tgt_node):
                    self.g.add_node(tgt_node, name=tgt_name, type="Dependency" if edge_type == "imports" else "External", file_path="external")
                self.g.add_edge(
                    src_node, tgt_node,
                    type=edge_type,
                    confidence=confidence,
                    snippet=snippet
                )

        return self

    def get_nodes_and_edges(self):
        nodes = []
        for n, d in self.g.nodes(data=True):
            nodes.append({
                "id": n,
                "name": d.get("name", n),
                "type": d.get("type", "Entity"),
                "filePath": d.get("file_path", "")
            })
        edges = []
        for u, v, d in self.g.edges(data=True):
            edges.append({
                "source": u,
                "target": v,
                "type": d.get("type", "references"),
                "confidence": d.get("confidence", "high")
            })
        return {"nodes": nodes, "edges": edges}

    def compute_impact(self, symbol: str):
        """
        Traverse the graph to compute blast radius of a change to `symbol`.
        Finds direct references, contract consumers, and transitive callers.
        """
        # Find matching nodes
        simple_term = symbol.split(".")[-1].lower()
        target_nodes = [
            n for n, d in self.g.nodes(data=True)
            if (
                d.get("name") == symbol or
                d.get("name", "").endswith("." + symbol) or
                n.endswith("::" + symbol) or
                d.get("name", "").lower() == symbol.lower() or
                d.get("name", "").lower() == simple_term or
                n.lower().endswith(f"::{simple_term}") or
                n.lower() == f"external::{simple_term}"
            )
        ]

        affected_nodes = set(target_nodes)
        direct_nodes = set()
        transitive_nodes = set()

        # In-edges and connected edges: who refers to, calls, or uses this symbol
        for tn in target_nodes:
            for pred in self.g.predecessors(tn):
                direct_nodes.add(pred)
                affected_nodes.add(pred)
            for succ in self.g.successors(tn):
                direct_nodes.add(succ)
                affected_nodes.add(succ)

        # Transitive callers/dependents (2 hops out)
        for dn in list(direct_nodes):
            for pred in self.g.predecessors(dn):
                if pred not in direct_nodes and pred not in target_nodes:
                    transitive_nodes.add(pred)
                    affected_nodes.add(pred)

        # Classify affected entities
        files_set: Set[str] = set()
        apis: List[Dict[str, Any]] = []
        components: List[Dict[str, Any]] = []
        tests: List[Dict[str, Any]] = []
        functions: List[Dict[str, Any]] = []

        all_affected = list(direct_nodes | transitive_nodes | set(target_nodes))

        for nid in all_affected:
            d = self.g.nodes.get(nid, {})
            fpath = d.get("file_path", "")
            if fpath and fpath != "external":
                files_set.add(fpath)

            etype = d.get("type")
            item = {
                "name": d.get("name", nid),
                "qualifiedName": nid,
                "filePath": fpath,
                "type": etype or "Entity"
            }

            if etype == "API":
                apis.append(item)
            elif etype == "Component":
                components.append(item)
            elif etype == "Test":
                tests.append(item)
            elif etype == "Function":
                functions.append(item)

        # Build visual subgraph for frontend
        sub_nodes = []
        sub_edges = []
        node_id_map = {}

        for nid in all_affected[:50]:  # limit to top 50 for clean rendering
            d = self.g.nodes[nid]
            sub_nodes.append({
                "id": nid,
                "name": d.get("name", nid),
                "type": d.get("type", "Entity"),
                "filePath": d.get("file_path", "")
            })
            node_id_map[nid] = True

        for u, v, d in self.g.edges(data=True):
            if u in node_id_map and v in node_id_map:
                sub_edges.append({
                    "source": u,
                    "target": v,
                    "type": d.get("type", "references"),
                    "confidence": d.get("confidence", "high"),
                    "snippet": d.get("snippet", "")
                })

        # Build impact_nodes with depth and via for frontend review queue & graph
        impact_nodes = []
        seen = set()

        # Target nodes (depth 0)
        for tn in target_nodes:
            if tn in seen:
                continue
            seen.add(tn)
            d = self.g.nodes.get(tn, {})
            impact_nodes.append({
                "name": d.get("name", tn),
                "file": d.get("file_path", ""),
                "type": d.get("type", "Field" if "." in tn else "Function"),
                "depth": 0,
                "confidence": "high",
                "via": "target"
            })

        # Direct callers/users (depth 1)
        for dn in direct_nodes:
            if dn in seen:
                continue
            seen.add(dn)
            d = self.g.nodes.get(dn, {})
            edge_data = {}
            if target_nodes:
                for tn in target_nodes:
                    ed = self.g.get_edge_data(dn, tn) or self.g.get_edge_data(tn, dn)
                    if ed:
                        edge_data = ed
                        break
            impact_nodes.append({
                "name": d.get("name", dn),
                "file": d.get("file_path", ""),
                "type": d.get("type", "Function"),
                "depth": 1,
                "confidence": edge_data.get("confidence", "high"),
                "via": edge_data.get("type", "calls")
            })

        # Transitive callers/users (depth 2)
        for tn in transitive_nodes:
            if tn in seen:
                continue
            seen.add(tn)
            d = self.g.nodes.get(tn, {})
            impact_nodes.append({
                "name": d.get("name", tn),
                "file": d.get("file_path", ""),
                "type": d.get("type", "Component" if "component" in d.get("file_path", "").lower() else "Function"),
                "depth": 2,
                "confidence": "medium",
                "via": "transitive"
            })

        return {
            "symbol": symbol,
            "summary": {
                "files": len(files_set),
                "apis": len(apis),
                "components": len(components),
                "tests": len(tests),
                "functions": len(functions)
            },
            "nodes": impact_nodes,
            "files": sorted(list(files_set)),
            "apis": [a["name"] for a in apis],
            "components": [c["name"] for c in components],
            "tests": [t["name"] for t in tests],
            "functions": [f["name"] for f in functions],
            "graph": {
                "nodes": sub_nodes,
                "edges": sub_edges
            }
        }
