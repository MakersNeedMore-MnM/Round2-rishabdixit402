import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify
from backend.app.db.connection import query_one, query_all, execute
from backend.app.api.auth import get_current_user
from backend.app.analysis.service import start_analysis_async
from backend.app.analysis.graph import CodeIntelligenceGraph
from backend.app.github.client import (
    commit_file_to_github,
    canonical_github_url,
    validate_branch_name,
    validate_file_path,
)

from backend.app.api.serializers import serialize_repo, serialize_finding, serialize_cleanup
from backend.app.api.guards import get_owned_repository, require_owner

repos_bp = Blueprint("repositories", __name__)

@repos_bp.route("/api/repositories", methods=["GET"])
def list_repositories():
    user = get_current_user()
    if not user:
        # Return the public demo repository for the instant walkthrough. Only
        # is_demo repositories are listed: those are exactly the ones the
        # anonymous caller is allowed to read back through the repo endpoints.
        demo_user = query_one("SELECT id FROM users WHERE email = 'demo@regit.dev'")
        if demo_user:
            repos = query_all(
                "SELECT * FROM repositories WHERE user_id = %s AND is_demo = true ORDER BY created_at DESC",
                (demo_user["id"],)
            )
            return jsonify({"repositories": [serialize_repo(r) for r in repos], "demo": True})
        return jsonify({"repositories": [], "demo": True})

    repos = query_all(
        "SELECT * FROM repositories WHERE user_id = %s ORDER BY created_at DESC",
        (user["id"],)
    )
    return jsonify({"repositories": [serialize_repo(r) for r in repos]})

@repos_bp.route("/api/repositories", methods=["POST"])
def connect_repository():
    # Creating a repository queues a network scan, so it must always belong to
    # the signed-in caller - never silently to the shared demo account, which
    # would let anonymous visitors pile repositories onto it.
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json() or {}
    github_url = data.get("githubUrl") or data.get("github_url")
    if not github_url:
        return jsonify({"error": "GitHub URL is required"}), 400

    # Only well-formed github.com URLs are stored. Anything else (internal
    # hosts, other domains) is rejected at the boundary so no code path can
    # later clone, fetch, or commit against it.
    canonical_url = canonical_github_url(github_url)
    if not canonical_url:
        return jsonify({"error": "Only valid github.com repository URLs are supported."}), 400
    github_url = canonical_url

    name = data.get("name") or github_url.rstrip("/").split("/")[-1].replace(".git", "") or "connected-repo"
    branch = (data.get("branch") or "main").strip()
    if not validate_branch_name(branch):
        return jsonify({"error": "Invalid branch name."}), 400
    description = data.get("description") or "Connected code repository."

    repo_id = str(uuid.uuid4())
    now = datetime.now()

    execute(
        """
        INSERT INTO repositories (id, user_id, name, github_url, branch, description, status, is_demo, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, 'analyzing', false, %s, %s)
        """,
        (repo_id, user["id"], name, github_url, branch, description, now, now)
    )

    # Cloning and indexing run in the background: the request must not block on
    # the repository size, and the `status` field reports progress instead.
    start_analysis_async(repo_id)

    fresh = query_one("SELECT * FROM repositories WHERE id = %s", (repo_id,))
    return jsonify({"repository": serialize_repo(fresh)}), 201

@repos_bp.route("/api/repositories/<repo_id>", methods=["GET"])
def get_repository(repo_id):
    # The public demo repository stays readable for the walkthrough; anything
    # else needs the signed-in owner.
    repo, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err
    return jsonify({"repository": serialize_repo(repo)})

@repos_bp.route("/api/repositories/<repo_id>", methods=["DELETE"])
def delete_repository(repo_id):
    # Deleting is destructive and personal: only the signed-in owner may do it.
    repo, _, err = require_owner(repo_id)
    if err:
        return err
    execute("DELETE FROM repositories WHERE id = %s", (repo["id"],))
    return jsonify({"ok": True})

@repos_bp.route("/api/repositories/<repo_id>", methods=["PATCH"])
def rename_repository(repo_id):
    # Renaming is an owner action; the repositories screen calls this on edit.
    repo, _, err = require_owner(repo_id)
    if err:
        return err

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400

    execute(
        "UPDATE repositories SET name = %s, updated_at = %s WHERE id = %s",
        (name, datetime.now(), repo["id"])
    )
    return jsonify({"ok": True, "name": name})

@repos_bp.route("/api/repositories/<repo_id>/overview", methods=["GET"])
def repository_overview(repo_id):
    repo, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err

    files = query_all("SELECT id, path, language, loc, status FROM repo_files WHERE repository_id = %s", (repo_id,))
    entities = query_all("SELECT id, type, name FROM entities WHERE repository_id = %s", (repo_id,))
    relationships = query_all("SELECT id FROM relationships WHERE repository_id = %s", (repo_id,))
    findings = query_all("SELECT * FROM findings WHERE repository_id = %s ORDER BY created_at DESC", (repo_id,))
    cleanup = query_all("SELECT * FROM cleanup_items WHERE repository_id = %s ORDER BY created_at DESC", (repo_id,))
    changes = query_all("SELECT id, symbol, change_type, file_path, created_at FROM changes WHERE repository_id = %s ORDER BY created_at DESC LIMIT 10", (repo_id,))
    analyses = query_all("SELECT id, status, started_at, finished_at FROM analyses WHERE repository_id = %s ORDER BY created_at DESC LIMIT 5", (repo_id,))

    by_type = {}
    for e in entities:
        t = e.get("type", "Other")
        by_type[t] = by_type.get(t, 0) + 1

    by_severity = {"high": 0, "medium": 0, "low": 0, "passed": 0}
    open_findings = []
    for f in findings:
        if f.get("status") != "dismissed":
            sev = f.get("severity", "medium")
            by_severity[sev] = by_severity.get(sev, 0) + 1
        if f.get("status") == "open":
            open_findings.append(f)

    by_cleanup = {}
    pending_cleanup = []
    for c in cleanup:
        t = c.get("type", "other")
        if c.get("status") != "dismissed":
            by_cleanup[t] = by_cleanup.get(t, 0) + 1
        if c.get("status") == "pending":
            pending_cleanup.append(c)

    # Health score: 100 minus weighted penalties
    penalty = sum(12 if f["severity"] == "high" else 5 if f["severity"] == "medium" else 2 for f in open_findings)
    cleanup_penalty = len(pending_cleanup) * 1.5
    health = max(8, min(100, round(100 - penalty - cleanup_penalty)))

    return jsonify({
        "repository": serialize_repo(repo),
        "stats": {
            "files": len(files),
            "entities": len(entities),
            "relationships": len(relationships),
            "byType": by_type,
            "bySeverity": by_severity,
            "byCleanup": by_cleanup,
            "health": health,
            "openFindings": len(open_findings),
            "pendingCleanup": len(pending_cleanup),
        },
        "recentFindings": [serialize_finding(f) for f in findings[:6]],
        "recentCleanup": [serialize_cleanup(c) for c in cleanup[:6]],
        "changes": [
            {
                "id": str(ch["id"]),
                "symbol": ch.get("symbol"),
                "changeType": ch.get("change_type"),
                "filePath": ch.get("file_path"),
                "createdAt": str(ch.get("created_at") or "")
            }
            for ch in changes
        ],
        "analyses": analyses,
        "files": files,
        "metrics": {
            "files": len(files),
            "functions": by_type.get("Function", 0) + by_type.get("Component", 0),
            "apis": by_type.get("API", 0),
            "dependencies": repo.get("total_dependencies") or 0
        },
        "safety": {
            "high": by_severity.get("high", 0),
            "medium": by_severity.get("medium", 0),
            "passed": by_severity.get("passed", 0),
            "totalFindings": len(findings)
        },
        "cleanup": {
            "unusedImports": by_cleanup.get("unused_import", 0),
            "deadFunctions": by_cleanup.get("dead_code", 0),
            "unusedDependencies": by_cleanup.get("unused_dependency", 0),
            "totalCleanup": len(cleanup)
        }
    })

@repos_bp.route("/api/repositories/<repo_id>/graph", methods=["GET"])
def repository_graph(repo_id):
    _, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err

    entities = query_all("SELECT * FROM entities WHERE repository_id = %s", (repo_id,))
    relationships = query_all("SELECT * FROM relationships WHERE repository_id = %s", (repo_id,))

    cg = CodeIntelligenceGraph()
    cg.build_from_records(entities, relationships)
    return jsonify(cg.get_nodes_and_edges())

@repos_bp.route("/api/repositories/<repo_id>/changes", methods=["GET"])
def repository_changes(repo_id):
    _, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err

    changes = query_all("SELECT * FROM changes WHERE repository_id = %s ORDER BY created_at DESC LIMIT 20", (repo_id,))
    return jsonify({"changes": changes})

@repos_bp.route("/api/repositories/<repo_id>/files", methods=["GET"])
def repository_files(repo_id):
    _, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err

    files = query_all(
        """
        SELECT f.id, f.path, f.language, f.loc, f.status, f.created_at,
               COUNT(e.id) as entity_count
        FROM repo_files f
        LEFT JOIN entities e ON e.file_id = f.id
        WHERE f.repository_id = %s
        GROUP BY f.id, f.path, f.language, f.loc, f.status, f.created_at
        ORDER BY f.path ASC
        """,
        (repo_id,)
    )
    return jsonify({"files": files})

@repos_bp.route("/api/repositories/<repo_id>/files/<file_id>", methods=["GET"])
def repository_file_detail(repo_id, file_id):
    _, err = get_owned_repository(repo_id, allow_demo_read=True)
    if err:
        return err

    file_record = query_one(
        "SELECT * FROM repo_files WHERE repository_id = %s AND id = %s",
        (repo_id, file_id)
    )
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    entities = query_all(
        "SELECT id, type, name, qualified_name, line_start, line_end, signature FROM entities WHERE file_id = %s ORDER BY line_start ASC",
        (file_id,)
    )
    return jsonify({
        "file": file_record,
        "entities": entities
    })

@repos_bp.route("/api/repositories/<repo_id>/files/<file_id>", methods=["PUT"])
def update_repository_file(repo_id, file_id):
    repo, _, err = require_owner(repo_id)
    if err:
        return err

    data = request.get_json() or {}
    content = data.get("content")
    if content is None:
        return jsonify({"error": "Content is required"}), 400
    loc = len(content.splitlines())
    updated = execute(
        "UPDATE repo_files SET content = %s, loc = %s WHERE repository_id = %s AND id = %s RETURNING id",
        (content, loc, repo["id"], file_id)
    )
    if not updated:
        return jsonify({"error": "File not found"}), 404
    return jsonify({"ok": True, "loc": loc})

@repos_bp.route("/api/repositories/<repo_id>/commit", methods=["POST"])
def commit_to_github(repo_id):
    # Pushing to GitHub is as personal as it gets: require the signed-in owner
    # and commit with *their* GitHub identity/token, never another user's.
    repo, user, err = require_owner(repo_id)
    if err:
        return err

    user_rec = query_one("SELECT github_token, name, email FROM users WHERE id = %s", (user["id"],))
    token = (user_rec.get("github_token") if user_rec else None) or os.getenv("GITHUB_TOKEN")
    if not token:
        return jsonify({"error": "GitHub Personal Access Token is required to commit and push. Please connect your GitHub account."}), 400

    data = request.get_json() or {}
    file_path = data.get("filePath")
    content = data.get("content")
    commit_message = (data.get("commitMessage") or "").strip() or f"Update {file_path} via ReGit"
    branch = (data.get("branch") or repo.get("branch") or "main").strip()
    author_name = (user_rec.get("name") if user_rec else None) or "ReGit User"
    author_email = (user_rec.get("email") if user_rec else None) or "user@regit.dev"

    if not file_path or content is None:
        return jsonify({"error": "File path and content are required."}), 400

    # Branch and file path end up in GitHub API URLs and ref lookups; keep
    # traversal, option, and metacharacter tricks out of both.
    if not validate_branch_name(branch):
        return jsonify({"error": "Invalid branch name."}), 400
    if not validate_file_path(file_path):
        return jsonify({"error": "Invalid file path."}), 400

    result = commit_file_to_github(
        token=token,
        github_url=repo["github_url"],
        file_path=file_path,
        content=content,
        commit_message=commit_message,
        branch=branch,
        author_name=author_name,
        author_email=author_email
    )

    if not result.get("ok"):
        return jsonify({"error": result.get("error", "GitHub commit failed")}), 400

    execute(
        "UPDATE repo_files SET content = %s, loc = %s WHERE repository_id = %s AND path = %s",
        (content, len(content.splitlines()), repo_id, file_path)
    )

    change_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO changes (id, repository_id, symbol, change_type, file_path, line_number, details, created_at)
        VALUES (%s, %s, %s, 'github_commit', %s, 1, %s, %s)
        """,
        (change_id, repo_id, file_path.split("/")[-1], file_path, result.get("commit_sha", "HEAD"), datetime.now())
    )

    return jsonify({
        "ok": True,
        "commitSha": result.get("commit_sha"),
        "commitUrl": result.get("commit_url"),
        "branch": branch,
        "filePath": file_path
    })

