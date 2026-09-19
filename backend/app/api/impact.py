import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify
from backend.app.db.connection import query_one, query_all, execute
from backend.app.analysis.graph import CodeIntelligenceGraph
from backend.app.api.guards import get_owned_repository

impact_bp = Blueprint("impact", __name__)

@impact_bp.route("/api/repositories/<repo_id>/impact", methods=["POST"])
def compute_repo_impact(repo_id):
    repo, err = get_owned_repository(repo_id, allow_demo_read=False)
    if err:
        return err

    data = request.get_json() or {}
    symbol = (data.get("symbol") or "").strip()
    if not symbol:
        return jsonify({"error": "Symbol is required"}), 400

    entities = query_all("SELECT * FROM entities WHERE repository_id = %s", (repo_id,))
    relationships = query_all("SELECT * FROM relationships WHERE repository_id = %s", (repo_id,))

    cg = CodeIntelligenceGraph()
    cg.build_from_records(entities, relationships)

    result = cg.compute_impact(symbol)

    # Persist change query in database
    change_id = str(uuid.uuid4())
    change_type = data.get("changeType") or "rename"
    new_val = data.get("newValue")

    desc = f"Impact query for {symbol}: {result['summary']['files']} files, {result['summary']['apis']} APIs, {result['summary']['components']} components, {result['summary']['tests']} tests."

    execute(
        """
        INSERT INTO changes (id, repository_id, file_path, symbol, change_type, old_value, new_value, description, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (change_id, repo["id"], result["files"][0] if result["files"] else "unknown", symbol, change_type, symbol, new_val, desc, datetime.now())
    )

    result["changeId"] = change_id
    return jsonify(result)

@impact_bp.route("/api/repositories/<repo_id>/impact", methods=["GET"])
def suggest_impact_symbols(repo_id):
    repo, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err
    is_demo = repo.get("is_demo", False)

    entities = query_all(
        """
        SELECT name, qualified_name, type, file_path 
        FROM entities 
        WHERE repository_id = %s AND type IN ('Function', 'Class', 'API', 'Component', 'Field')
        ORDER BY 
          CASE 
            WHEN type = 'Component' THEN 1
            WHEN type = 'API' THEN 2
            WHEN type = 'Function' THEN 3
            ELSE 4
          END,
          name ASC
        LIMIT 60
        """,
        (repo_id,)
    )

    suggestions = [
        {"name": e["name"], "qualifiedName": e["qualified_name"], "type": e["type"], "filePath": e["file_path"]}
        for e in entities
    ]

    if not suggestions and is_demo:
        suggestions = [
            {"name": "User.email", "qualifiedName": "backend/models/user.py::User.email", "type": "Field", "filePath": "backend/models/user.py"},
            {"name": "get_user_by_email", "qualifiedName": "backend/services/user_service.py::get_user_by_email", "type": "Function", "filePath": "backend/services/user_service.py"},
            {"name": "GET /users/{user_id}", "qualifiedName": "backend/api/user.py::api:GET /users/{user_id}", "type": "API", "filePath": "backend/api/user.py"},
        ]

    return jsonify({"suggestions": suggestions[:40]})
