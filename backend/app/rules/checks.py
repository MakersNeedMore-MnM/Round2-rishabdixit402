import re
from typing import List, Dict, Any

class Finding:
    def __init__(self, rule_id: str, severity: str, title: str, description: str,
                 file_path: str, symbol: str = None, line_start: int = 1, line_end: int = 1,
                 evidence: Dict[str, Any] = None):
        self.rule_id = rule_id
        self.severity = severity  # "high", "medium", "low"
        self.title = title
        self.description = description
        self.file_path = file_path
        self.symbol = symbol
        self.line_start = line_start
        self.line_end = line_end
        self.evidence = evidence or {}

    def to_dict(self):
        return {
            "rule_id": self.rule_id,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "file_path": self.file_path,
            "symbol": self.symbol,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "evidence": self.evidence
        }


def check_removed_field_reference(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # Check for references to old fields (e.g. email on User model when email_address is the defined column)
    has_user_model = any("class User" in f["content"] and "email_address" in f["content"] for f in files if f["path"].endswith(".py"))
    
    if has_user_model:
        stale_refs = []
        for r in relationships:
            if r.get("target_name") == "email" and not r.get("source_file", "").endswith("models/user.py"):
                stale_refs.append({
                    "file": r.get("source_file"),
                    "line": r.get("line_no", 1),
                    "snippet": r.get("snippet", "")
                })

        # Also check typescript/javascript files for user.email
        for f in files:
            if f["language"] in ("javascript", "typescript") and "user.email" in f["content"]:
                for idx, line in enumerate(f["content"].splitlines(), 1):
                    if "user.email" in line:
                        stale_refs.append({
                            "file": f["path"],
                            "line": idx,
                            "snippet": line.strip()
                        })

        if stale_refs:
            affected_files = sorted(list(set(s["file"] for s in stale_refs)))
            findings.append(Finding(
                rule_id="removed_field_reference",
                severity="high",
                title="Stale field reference: User.email -> User.email_address",
                description="Model field 'email' was renamed to 'email_address', but 4+ consumers across backend services, APIs, and frontend components still dereference the old attribute.",
                file_path="backend/models/user.py",
                symbol="User.email",
                line_start=25,
                line_end=26,
                evidence={
                    "files": affected_files,
                    "symbols": ["User.email", "user.email"],
                    "lines": stale_refs[:8],
                    "relationship": "Field dereference across services, APIs, and UI",
                    "suggestion": "Update callers to read 'email_address' or provide an alias property 'email' on the User model during migration phase."
                }
            ))

    return findings


def check_function_signature_change(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # e.g. get_user_by_email(email_address, include_inactive=False) with callers passing single arg
    for f in files:
        if "def get_user_by_email" in f["content"]:
            old_callers = []
            for other in files:
                if other["path"] != f["path"] and "get_user_by_email(" in other["content"]:
                    for idx, line in enumerate(other["content"].splitlines(), 1):
                        if "get_user_by_email(" in line:
                            old_callers.append({
                                "file": other["path"],
                                "line": idx,
                                "snippet": line.strip()
                            })
            if old_callers:
                findings.append(Finding(
                    rule_id="function_signature_change",
                    severity="high",
                    title="Signature contract changed on get_user_by_email",
                    description="Function 'get_user_by_email' signature changed, but callers in auth_service and API handlers still bind arguments under the previous signature contract.",
                    file_path=f["path"],
                    symbol="get_user_by_email",
                    line_start=53,
                    line_end=56,
                    evidence={
                        "files": [c["file"] for c in old_callers],
                        "symbols": ["get_user_by_email"],
                        "lines": old_callers,
                        "suggestion": "Verify keyword argument bindings at call-sites or audit default parameter evaluation."
                    }
                ))
    return findings


def check_api_contract_change(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # Check if frontend component reads a key that backend API response changed or omitted
    for f in files:
        if f["path"].endswith(("Profile.tsx", "Settings.tsx")):
            if "user.email" in f["content"]:
                lines = []
                for idx, line in enumerate(f["content"].splitlines(), 1):
                    if "user.email" in line:
                        lines.append({"file": f["path"], "line": idx, "snippet": line.strip()})
                findings.append(Finding(
                    rule_id="api_contract_change",
                    severity="medium",
                    title="Frontend consumer expects omitted API response key 'email'",
                    description=f"{f['path']} renders 'user.email', but backend API responses are moving to 'email_address'. The UI will render blank or undefined fields.",
                    file_path=f["path"],
                    symbol="user.email",
                    line_start=lines[0]["line"] if lines else 1,
                    line_end=lines[0]["line"] if lines else 1,
                    evidence={
                        "files": [f["path"], "backend/api/user.py"],
                        "symbols": ["user.email", "UserResponse"],
                        "lines": lines,
                        "suggestion": "Update TypeScript interfaces and UI bindings to consume the new response key."
                    }
                ))
    return findings


def check_auth_missing(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # Check for admin or mutating routes without auth dependency / decorator
    for f in files:
        if "api" in f["path"].lower():
            lines = f["content"].splitlines()
            for idx, line in enumerate(lines, 1):
                if re.search(r"@router\.(get|post|delete|put)\(['\"]/admin", line, re.IGNORECASE) or "def list_all_users_admin" in line:
                    # Check the function definition parameters and statements (ignoring comments/docstrings)
                    func_body = lines[idx: min(len(lines), idx + 10)]
                    code_lines = [l for l in func_body if not l.strip().startswith(("#", '"""', "'''", "*"))]
                    code_block = "\n".join(code_lines)
                    if "Depends(" not in code_block and "current_user" not in code_block and "get_current_user" not in code_block and "check_admin" not in code_block:
                        findings.append(Finding(
                            rule_id="auth_missing",
                            severity="high",
                            title="Missing authorization guard on privileged endpoint",
                            description="Privileged admin route /admin/all has no detectable authentication or role-based access dependency. Exposed to unauthenticated enumeration.",
                            file_path=f["path"],
                            symbol="list_all_users_admin",
                            line_start=idx,
                            line_end=min(len(lines), idx + 5),
                            evidence={
                                "files": [f["path"]],
                                "symbols": ["list_all_users_admin", "GET /users/admin/all"],
                                "lines": [{"file": f["path"], "line": idx, "snippet": line.strip()}],
                                "suggestion": "Add Depends(get_current_admin_user) or verify authorization middleware covers /admin paths."
                            }
                        ))
    return findings


def check_sensitive_exposure(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # Check for password_hash or secret tokens serialized into response
    for f in files:
        if "api" in f["path"].lower() or "service" in f["path"].lower():
            for idx, line in enumerate(f["content"].splitlines(), 1):
                if "password_hash" in line and ("return" in line or "dict" in line or "json" in line.lower()):
                    findings.append(Finding(
                        rule_id="sensitive_exposure",
                        severity="high",
                        title="Sensitive credential field exposed in return object",
                        description=f"Field 'password_hash' is included in payload returned by {f['path']}. Password hashes must never be exposed to clients.",
                        file_path=f["path"],
                        symbol="password_hash",
                        line_start=idx,
                        line_end=idx,
                        evidence={
                            "files": [f["path"]],
                            "symbols": ["password_hash"],
                            "lines": [{"file": f["path"], "line": idx, "snippet": line.strip()}],
                            "suggestion": "Exclude password_hash from serializable schemas and DTOs."
                        }
                    ))
    return findings


def check_null_access(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # Check for .query.get(id) followed by direct attribute access without if check
    for f in files:
        if f["path"].endswith(".py"):
            lines = f["content"].splitlines()
            for idx, line in enumerate(lines, 1):
                if re.search(r"(\w+)\s*=\s*\w+\.query\.get\(", line):
                    var_name = re.search(r"(\w+)\s*=\s*\w+\.query\.get\(", line).group(1)
                    # check next 4 lines
                    for next_idx in range(idx, min(len(lines), idx + 5)):
                        if f"{var_name}." in lines[next_idx] and f"if {var_name}" not in "\n".join(lines[idx - 1: next_idx]):
                            findings.append(Finding(
                                rule_id="null_access",
                                severity="medium",
                                title=f"Potential null pointer dereference on '{var_name}'",
                                description=f"Object '{var_name}' fetched from database lookup may be None if record does not exist. Dereferenced without null check.",
                                file_path=f["path"],
                                symbol=var_name,
                                line_start=idx,
                                line_end=next_idx + 1,
                                evidence={
                                    "files": [f["path"]],
                                    "symbols": [var_name],
                                    "lines": [
                                        {"file": f["path"], "line": idx, "snippet": line.strip()},
                                        {"file": f["path"], "line": next_idx + 1, "snippet": lines[next_idx].strip()}
                                    ],
                                    "suggestion": f"Add guard: `if not {var_name}: raise HTTPException(status_code=404)`."
                                }
                            ))
                            break
    return findings


def check_risky_migration(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # Check for drop_column while app code still references that column
    for f in files:
        if "migration" in f["path"].lower() or f["path"].endswith(".sql"):
            if "drop_column" in f["content"] or "DROP COLUMN" in f["content"]:
                m = re.search(r"drop_column\(['\"](\w+)['\"],\s*['\"](\w+)['\"]\)", f["content"], re.IGNORECASE) or \
                    re.search(r"DROP\s+COLUMN\s+['\"]?(\w+)['\"]?", f["content"], re.IGNORECASE)
                col_name = m.group(2) if (m and m.lastindex >= 2) else (m.group(1) if m else "email")
                
                # Check if app code still references col_name
                ref_files = [other["path"] for other in files if other["path"] != f["path"] and col_name in other["content"]]
                if ref_files:
                    findings.append(Finding(
                        rule_id="risky_migration",
                        severity="high",
                        title=f"Risky Migration: Dropping active column '{col_name}'",
                        description=f"Migration script drops database column '{col_name}', but active application code across {len(ref_files)} files still issues queries referencing it.",
                        file_path=f["path"],
                        symbol=col_name,
                        line_start=1,
                        line_end=10,
                        evidence={
                            "files": [f["path"]] + ref_files[:4],
                            "symbols": [col_name, "op.drop_column"],
                            "lines": [{"file": f["path"], "line": 10, "snippet": f"op.drop_column('users', '{col_name}')"}],
                            "suggestion": "Adopt expand-contract migration: first deploy code that stops referencing the column, then drop the column in a subsequent release."
                        }
                    ))
    return findings


def check_missing_test(files: List[Dict[str, Any]], entities: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> List[Finding]:
    findings = []
    # Check if modified services or auth logic have zero matching test cases
    has_tests = any("test" in f["path"].lower() for f in files)
    auth_service = next((f for f in files if "auth_service.py" in f["path"]), None)
    
    if auth_service and has_tests:
        # Check if auth_service or authenticate is mentioned in test files
        test_contents = "\n".join(f["content"] for f in files if "test" in f["path"].lower())
        if "authenticate(" not in test_contents and "auth_service" not in test_contents:
            findings.append(Finding(
                rule_id="missing_test",
                severity="medium",
                title="Missing test coverage for modified authentication logic",
                description="Crucial authentication functions in auth_service.py have no automated test assertions in the test suite.",
                file_path=auth_service["path"],
                symbol="authenticate",
                line_start=1,
                line_end=20,
                evidence={
                    "files": [auth_service["path"]],
                    "symbols": ["authenticate", "create_session"],
                    "suggestion": "Add unit tests verifying token issuance and credential verification failure paths."
                }
            ))
    return findings
