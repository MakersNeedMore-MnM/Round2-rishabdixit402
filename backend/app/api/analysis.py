from datetime import datetime
from flask import Blueprint, jsonify
from backend.app.analysis.service import start_analysis_async
from backend.app.api.guards import require_owner
from backend.app.db.connection import execute

analysis_bp = Blueprint("analysis", __name__)

@analysis_bp.route("/api/repositories/<repo_id>/analyze", methods=["POST"])
def trigger_analysis(repo_id):
    """
    Start a scan and return straight away.

    The scan runs in the background because cloning and indexing a repository
    takes far longer than an HTTP request should, so callers watch the
    repository `status` field ('analyzing' -> 'ready' | 'error') instead.

    Scanning pulls the repository over the network and rewrites every derived
    table, so only the signed-in owner may trigger it - not even the demo
    repository is re-scanned by an anonymous visitor.
    """
    repo, _, err = require_owner(repo_id)
    if err:
        return err

    if repo.get("status") == "analyzing":
        return jsonify({"ok": True, "status": "analyzing", "alreadyRunning": True}), 202

    execute(
        "UPDATE repositories SET status = 'analyzing', updated_at = %s WHERE id = %s",
        (datetime.now(), repo["id"])
    )
    start_analysis_async(repo["id"])

    return jsonify({"ok": True, "status": "analyzing"}), 202
