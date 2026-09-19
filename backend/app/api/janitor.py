from flask import Blueprint, request, jsonify
from backend.app.db.connection import query_all, execute
from backend.app.api.serializers import serialize_cleanup
from backend.app.api.guards import get_owned_repository, load_item_with_repo, authorize_item

janitor_bp = Blueprint("janitor", __name__)

@janitor_bp.route("/api/repositories/<repo_id>/cleanup", methods=["GET"])
def get_repository_cleanup(repo_id):
    # Demo repository stays publicly readable; other repositories need their owner.
    _, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err

    items = query_all(
        "SELECT * FROM cleanup_items WHERE repository_id = %s ORDER BY created_at ASC",
        (repo_id,)
    )
    return jsonify({"cleanup": [serialize_cleanup(item) for item in items]})

@janitor_bp.route("/api/cleanup/<item_id>", methods=["PATCH"])
def update_cleanup_status(item_id):
    item = load_item_with_repo("cleanup_items", item_id)
    err = authorize_item(item, mutation=True, kind="Cleanup item")
    if err:
        return err

    data = request.get_json() or {}
    status = data.get("status", "applied")
    execute("UPDATE cleanup_items SET status = %s WHERE id = %s", (status, item_id))
    return jsonify({"ok": True, "status": status})

@janitor_bp.route("/api/cleanup/<item_id>", methods=["DELETE"])
def delete_cleanup_item(item_id):
    item = load_item_with_repo("cleanup_items", item_id)
    err = authorize_item(item, mutation=True, kind="Cleanup item")
    if err:
        return err

    execute("DELETE FROM cleanup_items WHERE id = %s", (item_id,))
    return jsonify({"ok": True})

@janitor_bp.route("/api/cleanup/<item_id>/preview", methods=["POST"])
def preview_cleanup(item_id):
    item = load_item_with_repo("cleanup_items", item_id)
    # Preview reads the stored diff; owners always can, anonymous visitors only
    # for the demo repository (the walkthrough shows previews).
    err = authorize_item(item, mutation=False, kind="Cleanup item")
    if err:
        return err

    # Strip the authorization join columns before echoing the row back.
    item = {k: v for k, v in item.items() if k not in ("repo_user_id", "repo_is_demo")}

    return jsonify({
        "item": item,
        "preview": item.get("preview") or "No preview diff available."
    })
