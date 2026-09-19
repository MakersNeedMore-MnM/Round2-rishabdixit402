import ast
import re
from typing import List, Dict, Any

class CodeEntity:
    def __init__(self, type_: str, name: str, qualified_name: str, file_path: str,
                 line_start: int = 1, line_end: int = 1, signature: str = None, metadata: Dict[str, Any] = None):
        self.type = type_
        self.name = name
        self.qualified_name = qualified_name
        self.file_path = file_path
        self.line_start = line_start
        self.line_end = line_end
        self.signature = signature or ""
        self.metadata = metadata or {}

    def to_dict(self):
        return {
            "type": self.type,
            "name": self.name,
            "qualified_name": self.qualified_name,
            "file_path": self.file_path,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "signature": self.signature,
            "metadata": self.metadata
        }

class RawRelationship:
    def __init__(self, source_name: str, source_file: str, target_name: str,
                 type_: str, confidence: str = "high", line_no: int = None, snippet: str = None):
        self.source_name = source_name
        self.source_file = source_file
        self.target_name = target_name
        self.type = type_
        self.confidence = confidence
        self.line_no = line_no
        self.snippet = snippet or ""

    def to_dict(self):
        return {
            "source_name": self.source_name,
            "source_file": self.source_file,
            "target_name": self.target_name,
            "type": self.type,
            "confidence": self.confidence,
            "line_no": self.line_no,
            "snippet": self.snippet
        }

class PythonASTParser(ast.NodeVisitor):
    def __init__(self, file_path: str, content: str):
        self.file_path = file_path
        self.content = content
        self.lines = content.splitlines()
        self.entities: List[CodeEntity] = []
        self.relationships: List[RawRelationship] = []
        self.current_class = None
        self.current_function = None
        self.imports = {}

    def parse(self):
        try:
            tree = ast.parse(self.content, filename=self.file_path)
            self.visit(tree)
        except SyntaxError:
            pass
        return self.entities, self.relationships

    def _get_snippet(self, line_no: int) -> str:
        if 1 <= line_no <= len(self.lines):
            return self.lines[line_no - 1].strip()
        return ""

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            target = alias.name
            asname = alias.asname or alias.name
            self.imports[asname] = target
            self.relationships.append(RawRelationship(
                source_name=self.file_path,
                source_file=self.file_path,
                target_name=target,
                type_="imports",
                confidence="high",
                line_no=node.lineno,
                snippet=self._get_snippet(node.lineno)
            ))
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        module = node.module or ""
        for alias in node.names:
            full_target = f"{module}.{alias.name}" if module else alias.name
            asname = alias.asname or alias.name
            self.imports[asname] = full_target
            self.relationships.append(RawRelationship(
                source_name=self.file_path,
                source_file=self.file_path,
                target_name=full_target,
                type_="imports",
                confidence="high",
                line_no=node.lineno,
                snippet=self._get_snippet(node.lineno)
            ))
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        prev_class = self.current_class
        self.current_class = node.name
        qname = f"{self.file_path}::{node.name}"
        
        is_test = "test" in self.file_path.lower() or node.name.startswith("Test")
        entity_type = "Test" if is_test else "Class"

        self.entities.append(CodeEntity(
            type_=entity_type,
            name=node.name,
            qualified_name=qname,
            file_path=self.file_path,
            line_start=node.lineno,
            line_end=getattr(node, "end_lineno", node.lineno),
            signature=f"class {node.name}",
            metadata={"bases": [ast.unparse(b) for b in node.bases] if hasattr(ast, "unparse") else []}
        ))

        # Check class attributes (e.g. SQLAlchemy model columns)
        for stmt in node.body:
            if isinstance(stmt, ast.Assign):
                for target in stmt.targets:
                    if isinstance(target, ast.Name):
                        field_name = f"{node.name}.{target.id}"
                        field_qname = f"{self.file_path}::{field_name}"
                        self.entities.append(CodeEntity(
                            type_="Field",
                            name=field_name,
                            qualified_name=field_qname,
                            file_path=self.file_path,
                            line_start=stmt.lineno,
                            line_end=getattr(stmt, "end_lineno", stmt.lineno),
                            signature=f"{target.id} = ...",
                            metadata={"class": node.name, "attribute": target.id}
                        ))

        self.generic_visit(node)
        self.current_class = prev_class

    def visit_FunctionDef(self, node: ast.FunctionDef):
        prev_func = self.current_function
        self.current_function = node.name
        
        # Build qualified name
        if self.current_class:
            name = f"{self.current_class}.{node.name}"
        else:
            name = node.name
        qname = f"{self.file_path}::{name}"

        # Signature & arguments
        args = [arg.arg for arg in node.args.args]
        sig = f"def {node.name}({', '.join(args)})"

        # Detect API Route via decorators
        is_api = False
        api_method = "GET"
        api_path = ""
        for dec in node.decorator_list:
            dec_str = ast.unparse(dec) if hasattr(ast, "unparse") else ""
            if any(k in dec_str for k in ("router.", "app.route", "get(", "post(", "put(", "delete(")):
                is_api = True
                m = re.search(r"\.(get|post|put|delete|patch)\(['\"]([^'\"]+)['\"]", dec_str, re.IGNORECASE)
                if m:
                    api_method = m.group(1).upper()
                    api_path = m.group(2)
                break

        is_test = "test" in self.file_path.lower() or node.name.startswith("test_")

        if is_api:
            route_name = f"{api_method} {api_path or ('/' + node.name)}"
            self.entities.append(CodeEntity(
                type_="API",
                name=route_name,
                qualified_name=f"{self.file_path}::api:{route_name}",
                file_path=self.file_path,
                line_start=node.lineno,
                line_end=getattr(node, "end_lineno", node.lineno),
                signature=sig,
                metadata={"method": api_method, "path": api_path, "function": node.name, "params": args}
            ))

        entity_type = "Test" if is_test else "Function"
        self.entities.append(CodeEntity(
            type_=entity_type,
            name=name,
            qualified_name=qname,
            file_path=self.file_path,
            line_start=node.lineno,
            line_end=getattr(node, "end_lineno", node.lineno),
            signature=sig,
            metadata={"args": args, "is_async": False, "decorators": [ast.unparse(d) for d in node.decorator_list] if hasattr(ast, "unparse") else []}
        ))

        self.generic_visit(node)
        self.current_function = prev_func

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        # Treat async functions similarly
        self.visit_FunctionDef(node)

    def visit_Call(self, node: ast.Call):
        caller = self.current_function or self.file_path
        callee_name = ""
        if isinstance(node.func, ast.Name):
            callee_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            callee_name = node.func.attr
            # e.g. User.query.filter_by
            full_attr = ast.unparse(node.func) if hasattr(ast, "unparse") else ""
            if "drop_column" in full_attr:
                callee_name = "drop_column"

        if callee_name:
            self.relationships.append(RawRelationship(
                source_name=caller,
                source_file=self.file_path,
                target_name=callee_name,
                type_="calls",
                confidence="high",
                line_no=node.lineno,
                snippet=self._get_snippet(node.lineno)
            ))
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        # Captures references to fields like user.email or User.email_address
        caller = self.current_function or self.file_path
        attr_name = node.attr
        
        # Avoid double-counting inside method calls handled above
        full_expr = ast.unparse(node) if hasattr(ast, "unparse") else attr_name
        self.relationships.append(RawRelationship(
            source_name=caller,
            source_file=self.file_path,
            target_name=attr_name,
            type_="references",
            confidence="medium" if not isinstance(node.value, ast.Name) else "high",
            line_no=node.lineno,
            snippet=self._get_snippet(node.lineno)
        ))
        self.generic_visit(node)


def parse_typescript_javascript(file_path: str, content: str):
    entities = []
    relationships = []
    lines = content.splitlines()

    def get_snippet(line_no):
        if 1 <= line_no <= len(lines):
            return lines[line_no - 1].strip()
        return ""

    # Import statements: import { a, b } from "path"
    import_re = re.compile(r'import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+["\']([^"\']+)["\']')
    # Component or function: export function ComponentName or function foo()
    func_re = re.compile(r'(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)')
    arrow_re = re.compile(r'(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>')
    # Attribute references: object.property
    attr_re = re.compile(r'\b([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\b')
    # Calls: funcName(...)
    call_re = re.compile(r'\b([a-zA-Z_]\w*)\s*\(')

    for i, line in enumerate(lines, 1):
        m_imp = import_re.search(line)
        if m_imp:
            target = m_imp.group(4)
            symbols = m_imp.group(1) or m_imp.group(2) or m_imp.group(3) or target
            relationships.append(RawRelationship(
                source_name=file_path,
                source_file=file_path,
                target_name=target,
                type_="imports",
                confidence="high",
                line_no=i,
                snippet=get_snippet(i)
            ))
            for sym in [s.strip() for s in symbols.split(",") if s.strip()]:
                relationships.append(RawRelationship(
                    source_name=file_path,
                    source_file=file_path,
                    target_name=sym,
                    type_="references",
                    confidence="high",
                    line_no=i,
                    snippet=get_snippet(i)
                ))

        m_fn = func_re.search(line) or arrow_re.search(line)
        if m_fn:
            name = m_fn.group(1)
            params = m_fn.group(2)
            is_component = bool(name[0].isupper() and ("tsx" in file_path or "jsx" in file_path or "<" in content))
            etype = "Component" if is_component else "Function"
            entities.append(CodeEntity(
                type_=etype,
                name=name,
                qualified_name=f"{file_path}::{name}",
                file_path=file_path,
                line_start=i,
                line_end=i,
                signature=f"{name}({params})",
                metadata={"isComponent": is_component, "params": params}
            ))

        # Check attribute accesses (e.g. user.email, user.full_name)
        for m_attr in attr_re.finditer(line):
            obj = m_attr.group(1)
            attr = m_attr.group(2)
            if obj not in ("console", "Math", "JSON", "Object", "Array", "React", "document", "window"):
                relationships.append(RawRelationship(
                    source_name=file_path,
                    source_file=file_path,
                    target_name=attr,
                    type_="references",
                    confidence="medium",
                    line_no=i,
                    snippet=get_snippet(i)
                ))

        # Check function calls
        for m_call in call_re.finditer(line):
            callee = m_call.group(1)
            if callee not in ("if", "for", "while", "switch", "catch", "import", "function", "return"):
                relationships.append(RawRelationship(
                    source_name=file_path,
                    source_file=file_path,
                    target_name=callee,
                    type_="calls",
                    confidence="medium",
                    line_no=i,
                    snippet=get_snippet(i)
                ))

    return entities, relationships

def parse_file(file_path: str, language: str, content: str):
    if language == "python" or file_path.endswith(".py"):
        parser = PythonASTParser(file_path, content)
        return parser.parse()
    elif language in ("javascript", "typescript") or file_path.endswith((".js", ".jsx", ".ts", ".tsx")):
        return parse_typescript_javascript(file_path, content)
    return [], []
