import uuid
from datetime import datetime
from flask import Blueprint, jsonify
from backend.app.db.connection import query_one, execute
from backend.app.api.auth import hash_password
from backend.app.db.seed_data import DEMO_REPO_NAME, DEMO_REPO_URL
from backend.app.analysis.service import analyze_repository_full

seed_bp = Blueprint("seed", __name__)

@seed_bp.route("/api/seed", methods=["POST"])
def seed_database():
    user = query_one("SELECT * FROM users WHERE email = 'demo@regit.dev'")
    if not user:
        user_id = str(uuid.uuid4())
        pw = hash_password("regit-demo-123")
        execute(
            """
            INSERT INTO users (id, email, name, password_hash, avatar_hue, created_at)
            VALUES (%s, 'demo@regit.dev', 'Rishab Dixit', %s, 95, %s)
            """,
            (user_id, pw, datetime.now())
        )
        user = {"id": user_id}
    else:
        user_id = user["id"]

    demo_repo = query_one(
        "SELECT * FROM repositories WHERE user_id = %s AND is_demo = true",
        (user_id,)
    )
    if not demo_repo:
        repo_id = str(uuid.uuid4())
        now = datetime.now()
        execute(
            """
            INSERT INTO repositories (id, user_id, name, github_url, branch, description, status, is_demo, created_at, updated_at)
            VALUES (%s, %s, %s, %s, 'main', 'Intentionally-designed demo: rename fallout, contract breaks, missing auth, cleanup targets.', 'pending', true, %s, %s)
            """,
            (repo_id, user_id, DEMO_REPO_NAME, DEMO_REPO_URL, now, now)
        )
        demo_repo_id = repo_id
    else:
        demo_repo_id = demo_repo["id"]

    # Run analysis
    analyze_repository_full(demo_repo_id)

    return jsonify({
        "ok": True,
        "userId": user_id,
        "demoRepoId": demo_repo_id
    })
