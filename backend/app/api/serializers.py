from datetime import datetime

def format_date(d):
    if not d:
        return None
    if isinstance(d, datetime):
        return d.isoformat()
    return str(d)

def serialize_repo(r):
    if not r:
        return None
    d = dict(r)
    return {
        **d,
        "id": str(r.get("id")),
        "userId": str(r.get("user_id")),
        "name": r.get("name"),
        "githubUrl": r.get("github_url"),
        "branch": r.get("branch"),
        "description": r.get("description"),
        "status": r.get("status"),
        "isDemo": bool(r.get("is_demo")),
        "totalFiles": r.get("total_files") or 0,
        "totalFunctions": r.get("total_functions") or 0,
        "totalApis": r.get("total_apis") or 0,
        "totalDependencies": r.get("total_dependencies") or 0,
        "createdAt": format_date(r.get("created_at")),
        "updatedAt": format_date(r.get("updated_at")),
        "lastAnalyzedAt": format_date(r.get("last_analyzed_at")),
    }

def serialize_finding(f):
    if not f:
        return None
    d = dict(f)
    return {
        **d,
        "id": str(f.get("id")),
        "analysisId": str(f.get("analysis_id")),
        "repositoryId": str(f.get("repository_id")),
        "changeId": str(f.get("change_id")) if f.get("change_id") else None,
        "ruleId": f.get("rule_id"),
        "severity": f.get("severity"),
        "title": f.get("title"),
        "description": f.get("description"),
        "evidence": f.get("evidence"),
        "filePath": f.get("file_path"),
        "symbol": f.get("symbol"),
        "lineStart": f.get("line_start"),
        "lineEnd": f.get("line_end"),
        "status": f.get("status"),
        "aiExplanation": f.get("ai_explanation"),
        "createdAt": format_date(f.get("created_at")),
    }

def serialize_cleanup(c):
    if not c:
        return None
    d = dict(c)
    return {
        **d,
        "id": str(c.get("id")),
        "analysisId": str(c.get("analysis_id")),
        "repositoryId": str(c.get("repository_id")),
        "type": c.get("type"),
        "target": c.get("target"),
        "filePath": c.get("file_path"),
        "confidence": c.get("confidence"),
        "description": c.get("description"),
        "preview": c.get("preview"),
        "status": c.get("status"),
        "createdAt": format_date(c.get("created_at")),
    }
