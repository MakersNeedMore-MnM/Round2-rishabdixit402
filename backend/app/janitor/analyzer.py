import re
import json
from typing import List, Dict, Any

class CleanupItem:
    def __init__(self, type_: str, target: str, file_path: str, description: str,
                 confidence: str = "high", preview: str = "", status: str = "pending"):
        self.type = type_  # "unused_import", "dead_code", "unused_dependency", "duplicate_utility"
        self.target = target
        self.file_path = file_path
        self.description = description
        self.confidence = confidence
        self.preview = preview
        self.status = status

    def to_dict(self):
        return {
            "type": self.type,
            "target": self.target,
            "file_path": self.file_path,
            "description": self.description,
            "confidence": self.confidence,
            "preview": self.preview,
            "status": self.status
        }

class JanitorAnalyzer:
    def analyze(self, files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        items: List[CleanupItem] = []

        # 1. Real Unused Imports Detection (Python & TypeScript/JavaScript)
        for f in files:
            lang = f.get("language", "")
            lines = f["content"].splitlines()

            for idx, line in enumerate(lines, 1):
                sline = line.strip()
                imported_names = []

                # Python imports
                if lang == "python":
                    m_py = re.match(r"^(?:from\s+[\w\.]+\s+import\s+([\w\s,]+)|import\s+([\w\.]+))", sline)
                    if m_py and not f["path"].endswith("__init__.py"):
                        names_str = m_py.group(1) or m_py.group(2) or ""
                        imported_names = [n.strip().split(" as ")[-1] for n in names_str.split(",") if n.strip()]

                # TypeScript / JavaScript imports
                elif lang in ("javascript", "typescript"):
                    # e.g. import { foo, bar } from '...'; or import foo from '...'
                    # skip pure type-only imports or handle them cleanly
                    m_ts = re.match(r"^import\s+(?:type\s+)?(?:\{\s*([^}]+)\s*\}|([\w$]+))(?:\s*,\s*\{\s*([^}]+)\s*\})?\s+from\s+['\"][^'\"]+['\"]", sline)
                    if m_ts:
                        named1 = m_ts.group(1) or ""
                        default_name = m_ts.group(2) or ""
                        named2 = m_ts.group(3) or ""
                        raw_names = []
                        if default_name and default_name != "type":
                            raw_names.append(default_name)
                        for block in (named1, named2):
                            if block:
                                for part in block.split(","):
                                    part = part.strip()
                                    if part.startswith("type "):
                                        part = part[5:].strip()
                                    if " as " in part:
                                        part = part.split(" as ")[-1].strip()
                                    if part and part != "type":
                                        raw_names.append(part)
                        imported_names = raw_names

                if not imported_names:
                    continue

                # Content of the file without this import line
                rest_content = "\n".join(lines[:idx - 1] + lines[idx:])

                for name in imported_names:
                    # Check if symbol name appears as a whole identifier in the rest of file
                    pattern = r"\b" + re.escape(name) + r"\b"
                    if not re.search(pattern, rest_content):
                        preview = f"--- {f['path']}\n+++ {f['path']}\n@@ -{idx},1 +{idx},0 @@\n- {sline}"
                        items.append(CleanupItem(
                            type_="unused_import",
                            target=name,
                            file_path=f["path"],
                            description=f"Unused import '{name}' in {f['path']}. Leftover from debugging or refactoring.",
                            confidence="high",
                            preview=preview
                        ))

        # 2. Real Dead Code Detection (Functions with 0 callers)
        called_targets = set(r.get("target_name") for r in relationships if r.get("target_name"))
        for e in entities:
            etype = e.get("type")
            name = e.get("name", "")
            fpath = e.get("file_path", "")

            # Exclude tests, dunder methods, React entrypoints / pages, and exported APIs
            if etype == "Function" and not name.startswith("test_") and not name.startswith("__"):
                if any(k in fpath.lower() for k in ("routes", "pages", "app.tsx", "main.tsx", "index.tsx", "test")):
                    continue
                short_name = name.split(".")[-1]
                if short_name not in called_targets and name not in called_targets:
                    # Check if comments explicitly indicate deprecated / abandoned code
                    for f in files:
                        if f["path"] == fpath:
                            lines = f["content"].splitlines()
                            lstart = max(1, e.get("line_start", 1))
                            block = "\n".join(lines[max(0, lstart - 3): min(len(lines), lstart + 8)])
                            if any(k in block.lower() for k in ("dead", "deprecated", "legacy", "unused", "todo: remove")):
                                items.append(CleanupItem(
                                    type_="dead_code",
                                    target=name,
                                    file_path=fpath,
                                    description=f"Dead function '{name}' has 0 callers across the repository and is flagged legacy/deprecated.",
                                    confidence="high",
                                    preview=f"--- {fpath}\n+++ {fpath}\n@@ -{lstart},8 +{lstart},0 @@\n- function {short_name}(...)\n-     // Deprecated code"
                                ))
                            break

        # 3. Real Duplicate Utilities Detection
        fn_names: Dict[str, List[Dict[str, Any]]] = {}
        for e in entities:
            if e.get("type") == "Function":
                name = e.get("name", "").split(".")[-1]
                fn_names.setdefault(name, []).append(e)

        for name, defs in fn_names.items():
            if len(defs) > 1 and not name.startswith("test_") and name not in ("__init__", "to_dict", "render", "handler", "get", "post"):
                paths = list(set(d["file_path"] for d in defs))
                if len(paths) > 1:
                    items.append(CleanupItem(
                        type_="duplicate_utility",
                        target=name,
                        file_path=paths[0],
                        description=f"Function '{name}' is declared in multiple files ({', '.join(paths[:3])}). Consolidate into a shared utility helper.",
                        confidence="medium",
                        preview=f"Consolidate {paths[0]} and {paths[1]} into a shared helper"
                    ))

        # 4. Real Unused Dependencies Detection (package.json or requirements.txt)
        all_code_content = " ".join(f.get("content", "") for f in files)

        # Check package.json for JS/TS repos
        pkg_file = next((f for f in files if f["path"] == "package.json"), None)
        if pkg_file:
            try:
                pkg_data = json.loads(pkg_file["content"])
                deps = pkg_data.get("dependencies", {})
                for dep in deps.keys():
                    # Skip common build/ambient deps
                    if dep.startswith("@types/") or dep in ("react", "react-dom"):
                        continue
                    # Check if imported anywhere in files
                    dep_pattern = r"['\"]" + re.escape(dep) + r"(/[\w\-]+)?['\"]"
                    if not re.search(dep_pattern, all_code_content):
                        items.append(CleanupItem(
                            type_="unused_dependency",
                            target=dep,
                            file_path="package.json",
                            description=f"Package '{dep}' is listed in package.json dependencies but is never imported in project code.",
                            confidence="high",
                            preview=f"--- package.json\n+++ package.json\n- \"{dep}\": \"{deps[dep]}\""
                        ))
            except Exception:
                pass

        # Check requirements.txt for Python repos
        req_file = next((f for f in files if "requirements.txt" in f["path"]), None)
        if req_file:
            for rline in req_file["content"].splitlines():
                pkg = rline.split("==")[0].split(">=")[0].split("<=")[0].strip()
                if pkg and not pkg.startswith("#"):
                    pkg_mod = pkg.replace("-", "_").lower()
                    if not re.search(r"\b(import|from)\s+" + re.escape(pkg_mod) + r"\b", all_code_content):
                        items.append(CleanupItem(
                            type_="unused_dependency",
                            target=pkg,
                            file_path=req_file["path"],
                            description=f"Python requirement '{pkg}' has no corresponding import in repository source files.",
                            confidence="high",
                            preview=f"--- {req_file['path']}\n+++ {req_file['path']}\n- {rline}"
                        ))

        return [item.to_dict() for item in items]
