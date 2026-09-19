from flask import Blueprint, request, jsonify
from backend.app.db.connection import execute
from backend.app.ai.provider import explain_finding
from backend.app.api.serializers import serialize_finding
from backend.app.api.guards import get_owned_repository, load_item_with_repo, authorize_item

findings_bp = Blueprint("findings", __name__)

@findings_bp.route("/api/repositories/<repo_id>/findings", methods=["GET"])
def get_repository_findings(repo_id):
    # Demo repository stays publicly readable; other repositories need their owner.
    _, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err

    findings = execute(
        "SELECT * FROM findings WHERE repository_id = %s ORDER BY created_at ASC",
        (repo_id,)
    ) or []
    return jsonify({"findings": [serialize_finding(f) for f in findings]})

@findings_bp.route("/api/findings/<finding_id>", methods=["PATCH"])
def update_finding_status(finding_id):
    item = load_item_with_repo("findings", finding_id)
    err = authorize_item(item, mutation=True, kind="Finding")
    if err:
        return err

    data = request.get_json() or {}
    status = data.get("status", "resolved")
    execute("UPDATE findings SET status = %s WHERE id = %s", (status, finding_id))
    return jsonify({"ok": True, "status": status})

@findings_bp.route("/api/findings/<finding_id>/explain", methods=["POST"])
def explain_finding_endpoint(finding_id):
    item = load_item_with_repo("findings", finding_id)
    # Explaining calls out to the AI provider, so treat it as a mutation:
    # only the owner may spend tokens on a finding.
    err = authorize_item(item, mutation=True, kind="Finding")
    if err:
        return err

    # If already explained, return cached explanation
    if item.get("ai_explanation"):
        return jsonify({
            "explanation": item["ai_explanation"],
            "provider": "cached"
        })

    explanation_data = explain_finding(item)
    text = explanation_data.get("text", "")
    provider = explanation_data.get("provider", "regit-local")

    execute("UPDATE findings SET ai_explanation = %s WHERE id = %s", (text, finding_id))

    return jsonify({
        "explanation": text,
        "provider": provider
    })
