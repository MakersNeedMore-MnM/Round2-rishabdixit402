import os
import uuid
import secrets
import requests
from datetime import datetime
from urllib.parse import urlencode
from flask import Blueprint, request, jsonify, redirect, make_response
from backend.app.config import Config
from backend.app.db.connection import query_one, query_all, execute
from backend.app.api.auth import (
    get_current_user,
    create_user_session,
    set_session_cookie,
    is_https_request,
)
from backend.app.api.serializers import serialize_repo
from backend.app.analysis.service import start_analysis_async
from backend.app.github.client import (
    validate_github_token,
    list_github_repos,
    parse_github_url,
    canonical_github_url,
    validate_branch_name,
    get_repo_branches,
    get_primary_email,
)

github_bp = Blueprint("github", __name__)

def _create_repo_entry(user_id, name, github_url, branch, description, scan=True):
    """
    Create a repository entry and queue its scan.

    The INSERT is metadata only and the scan is queued (never run inline), so
    this stays fast no matter how many repositories are imported or how large
    they are - files then fill in as the background workers finish.
    """
    repo_id = str(uuid.uuid4())
    now = datetime.now()
    execute(
        """
        INSERT INTO repositories (id, user_id, name, github_url, branch, description, status, is_demo, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, false, %s, %s)
        """,
        (repo_id, user_id, name, github_url, branch, description, "analyzing" if scan else "pending", now, now)
    )
    if scan:
        start_analysis_async(repo_id)
    return repo_id


def get_effective_github_token(user):
    """
    Returns user's saved github_token or GITHUB_TOKEN from environment.
    """
    if user and user.get("github_token"):
        return user["github_token"]
    env_token = os.getenv("GITHUB_TOKEN")
    if env_token:
        return env_token.strip()
    return None

@github_bp.route("/api/github/status", methods=["GET"])
def github_status():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    token = get_effective_github_token(user)
    if not token:
        return jsonify({
            "connected": False,
            "username": None,
            "avatarUrl": None,
        })

    # Return stored info or validate
    username = user.get("github_username")
    avatar_url = user.get("github_avatar_url")

    if not username:
        # Validate and populate
        val = validate_github_token(token)
        if val["ok"]:
            gh_u = val["user"]
            username = gh_u.get("login")
            avatar_url = gh_u.get("avatar_url")
            execute(
                "UPDATE users SET github_token = %s, github_username = %s, github_avatar_url = %s WHERE id = %s",
                (token, username, avatar_url, user["id"])
            )

    return jsonify({
        "connected": True,
        "username": username,
        "avatarUrl": avatar_url,
        "hasToken": bool(token)
    })

@github_bp.route("/api/github/connect", methods=["POST"])
def github_connect():
    # Authenticate before touching the token so an anonymous caller cannot use
    # this endpoint to probe GitHub API credentials.
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    data = request.get_json() or {}
    token = (data.get("token") or "").strip()

    if not token:
        return jsonify({"error": "GitHub Personal Access Token is required."}), 400

    # Validate token against GitHub API
    val = validate_github_token(token)
    if not val["ok"]:
        return jsonify({"error": val.get("error", "Failed to validate GitHub token.")}), 400

    gh_user = val["user"]

    execute(
        """
        UPDATE users
        SET github_token = %s, github_username = %s, github_avatar_url = %s
        WHERE id = %s
        """,
        (token, gh_user["login"], gh_user.get("avatar_url"), user["id"])
    )

    return jsonify({
        "ok": True,
        "connected": True,
        "user": {
            "login": gh_user["login"],
            "name": gh_user.get("name"),
            "avatarUrl": gh_user.get("avatar_url"),
            "publicRepos": gh_user.get("public_repos", 0),
            "scopes": gh_user.get("scopes", []),
        }
    })

@github_bp.route("/api/github/disconnect", methods=["POST"])
def github_disconnect():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    execute(
        """
        UPDATE users
        SET github_token = NULL, github_username = NULL, github_avatar_url = NULL
        WHERE id = %s
        """,
        (user["id"],)
    )

    return jsonify({"ok": True, "connected": False})

@github_bp.route("/api/github/repos", methods=["GET"])
def github_repos():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    token = get_effective_github_token(user)
    if not token:
        return jsonify({
            "error": "GitHub not connected. Please connect your GitHub account first.",
            "connected": False
        }), 401

    result = list_github_repos(token)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400

    return jsonify({
        "ok": True,
        "repositories": result["repositories"]
    })

@github_bp.route("/api/github/import", methods=["POST"])
def github_import():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    data = request.get_json() or {}
    github_url = data.get("githubUrl") or data.get("github_url")
    if not github_url:
        return jsonify({"error": "GitHub URL is required."}), 400

    # Same boundary rule as POST /api/repositories: only github.com URLs.
    canonical_url = canonical_github_url(github_url)
    if not canonical_url:
        return jsonify({"error": "Only valid github.com repository URLs are supported."}), 400
    github_url = canonical_url

    name = data.get("name") or github_url.rstrip("/").split("/")[-1].replace(".git", "")
    branch = (data.get("branch") or "main").strip()
    if not validate_branch_name(branch):
        return jsonify({"error": "Invalid branch name."}), 400
    description = data.get("description") or "Imported from GitHub."

    repo_id = _create_repo_entry(user["id"], name, github_url, branch, description)

    fresh = query_one("SELECT * FROM repositories WHERE id = %s", (repo_id,))
    return jsonify({"repository": serialize_repo(fresh)}), 201


@github_bp.route("/api/github/import-repos", methods=["POST"])
def github_import_all():
    """
    Import every repository the connected GitHub account can access.

    Entries are metadata only (status 'pending'); scanning is a separate step
    the user triggers per repository. Already-imported repositories are skipped,
    so this is safe to call again to pick up newly created repos.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401

    token = get_effective_github_token(user)
    if not token:
        return jsonify({
            "error": "GitHub not connected. Please connect your GitHub account first.",
            "connected": False,
        }), 401

    result = list_github_repos(token)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400

    existing = query_all("SELECT github_url FROM repositories WHERE user_id = %s", (user["id"],))
    known = {row["github_url"] for row in existing}

    imported = 0
    for remote in result["repositories"]:
        html_url = canonical_github_url(remote.get("html_url") or "")
        # Skip anything that is not a well-formed github.com URL, even though
        # the API is expected to return one - store only canonical URLs.
        if not html_url or html_url in known:
            continue
        _create_repo_entry(
            user_id=user["id"],
            name=remote.get("name") or html_url.rstrip("/").split("/")[-1],
            github_url=html_url,
            branch=remote.get("default_branch") or "main",
            description=remote.get("description") or "Imported from GitHub.",
        )
        known.add(html_url)
        imported += 1

    return jsonify({
        "ok": True,
        "imported": imported,
        "total": len(result["repositories"]),
    })

# ---------------------------------------------------------------------------
# GitHub OAuth sign-in
#
# /api/github/login  -> github.com ... -> /api/github/callback
# The callback turns a GitHub identity into a local account plus a session,
# so "Continue with GitHub" works as a real sign-in and not just a token link.
# ---------------------------------------------------------------------------

OAUTH_STATE_COOKIE = "regit_oauth_state"
OAUTH_STATE_MAX_AGE = 600  # seconds the user gets to finish on GitHub
OAUTH_SCOPES = "read:user user:email repo"
# Sentinel that verify_password() can never match, so GitHub-only accounts
# have no usable password (same idea as Django's unusable password).
UNUSABLE_PASSWORD = "!"


def _forwarded_first(value):
    return (value or "").split(",")[0].strip()


def get_github_client_id():
    return (os.getenv("GITHUB_CLIENT_ID") or Config.GITHUB_CLIENT_ID or "").strip()


def get_github_client_secret():
    return (os.getenv("GITHUB_CLIENT_SECRET") or Config.GITHUB_CLIENT_SECRET or "").strip()


def get_github_redirect_uri():
    """
    The callback URL GitHub sends the browser to.

    Flask runs behind the Next.js proxy, so `request.host` is the internal
    backend address and must never be used blindly. Priority:
      1. GITHUB_REDIRECT_URI     - explicit override, e.g. production
      2. PUBLIC_APP_URL          - + /api/github/callback
      3. X-Forwarded-*           - forwarded by the proxy
      4. the request's own host  - direct-to-Flask setups
    """
    explicit = (os.getenv("GITHUB_REDIRECT_URI") or Config.GITHUB_REDIRECT_URI or "").strip()
    if explicit:
        return explicit

    base = (os.getenv("PUBLIC_APP_URL") or Config.PUBLIC_APP_URL or "").strip().rstrip("/")
    if not base:
        host = _forwarded_first(request.headers.get("X-Forwarded-Host")) or request.host
        proto = _forwarded_first(request.headers.get("X-Forwarded-Proto")) or request.scheme or "http"
        base = f"{proto}://{host}"

    return f"{base}/api/github/callback"


def _oauth_failure(reason):
    public_app_url = (os.getenv("PUBLIC_APP_URL") or Config.PUBLIC_APP_URL or "").strip().rstrip("/")
    target = f"{public_app_url}/login?error={reason}" if public_app_url else f"/login?error={reason}"
    resp = make_response(redirect(target))
    resp.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return resp


def _upsert_github_user(gh_user, access_token, email):
    login = (gh_user.get("login") or "").strip()
    if not login:
        return None

    existing = query_one("SELECT id FROM users WHERE github_username = %s", (login,))
    if not existing and email:
        existing = query_one("SELECT id FROM users WHERE email = %s", (email,))

    display_name = (gh_user.get("name") or login).strip() or login
    avatar_url = gh_user.get("avatar_url")

    if existing:
        execute(
            """
            UPDATE users
            SET github_token = %s, github_username = %s, github_avatar_url = %s
            WHERE id = %s
            """,
            (access_token, login, avatar_url, existing["id"])
        )
        return existing["id"]

    user_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO users (id, email, name, password_hash, avatar_hue, github_token, github_username, github_avatar_url, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            user_id,
            email,
            display_name,
            UNUSABLE_PASSWORD,
            sum(ord(c) for c in email) % 360,
            access_token,
            login,
            avatar_url,
            datetime.now(),
        )
    )
    return user_id


@github_bp.route("/api/github/login", methods=["GET"])
def github_oauth_login():
    client_id = get_github_client_id()
    if not client_id:
        return _oauth_failure("github_not_configured")

    state = secrets.token_urlsafe(32)
    query = urlencode({
        "client_id": client_id,
        "redirect_uri": get_github_redirect_uri(),
        "scope": OAUTH_SCOPES,
        "state": state,
        "allow_signup": "true",
    })

    resp = make_response(redirect(f"https://github.com/login/oauth/authorize?{query}"))
    # Short-lived, httpOnly, single-use CSRF token for the OAuth round trip.
    resp.set_cookie(
        OAUTH_STATE_COOKIE,
        state,
        max_age=OAUTH_STATE_MAX_AGE,
        httponly=True,
        samesite="Lax",
        secure=is_https_request(),
        path="/",
    )
    return resp

@github_bp.route("/api/github/callback", methods=["GET"])
@github_bp.route("/api/auth/github/callback", methods=["GET"])
@github_bp.route("/github/callback", methods=["GET"])
def github_oauth_callback():
    try:
        if request.args.get("error"):
            return _oauth_failure("github_denied")

        code = request.args.get("code")
        state = request.args.get("state")
        expected_state = request.cookies.get(OAUTH_STATE_COOKIE)

        # CSRF: the state we issued must come back unchanged (constant-time), and
        # the state cookie is consumed below so it cannot be replayed.
        if not code:
            return _oauth_failure("github_failed")
        if not expected_state or not state or not secrets.compare_digest(expected_state, state):
            return _oauth_failure("github_state_mismatch")

        client_id = get_github_client_id()
        client_secret = get_github_client_secret()
        if not client_id or not client_secret:
            return _oauth_failure("github_not_configured")

        # Exchange the temporary code for an access token
        try:
            token_resp = requests.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": get_github_redirect_uri(),
                },
                timeout=15
            )
            data = token_resp.json() if token_resp.status_code == 200 else {}
        except (requests.RequestException, ValueError) as exc:
            print(f"[GitHub OAuth] Token exchange failed: {exc}")
            return _oauth_failure("github_failed")

        access_token = data.get("access_token")
        if not access_token:
            print(f"[GitHub OAuth] No access token returned: {data.get('error')}")
            return _oauth_failure("github_failed")

        validation = validate_github_token(access_token)
        if not validation.get("ok"):
            print(f"[GitHub OAuth] Token validation failed: {validation.get('error')}")
            return _oauth_failure("github_failed")

        gh_user = validation["user"]

        # GitHub only exposes a public email, so ask for the verified primary one,
        # then fall back to the stable noreply address to keep the account unique.
        email = (gh_user.get("email") or "").strip().lower()
        if not email:
            email = (get_primary_email(access_token) or "").strip().lower()
        if not email or "@" not in email:
            email = f"{gh_user.get('login')}@users.noreply.github.com"

        user_id = _upsert_github_user(gh_user, access_token, email)
        if not user_id:
            return _oauth_failure("github_failed")

        session_token, expires = create_user_session(user_id)

        public_app_url = (os.getenv("PUBLIC_APP_URL") or Config.PUBLIC_APP_URL or "").strip().rstrip("/")
        target_url = f"{public_app_url}/dashboard/repositories?github=connected" if public_app_url else "/dashboard/repositories?github=connected"

        resp = make_response(redirect(target_url))
        resp.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        set_session_cookie(resp, session_token, expires, secure=is_https_request())
        return resp
    except Exception as exc:
        import traceback
        trace = traceback.format_exc()
        print(f"[OAuth Callback Error] {exc}\n{trace}")
        return jsonify({
            "error": "OAuth Callback Error",
            "details": str(exc),
            "trace": trace
        }), 500

