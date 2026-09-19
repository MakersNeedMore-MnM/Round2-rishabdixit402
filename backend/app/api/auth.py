import os
import hmac
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, make_response
from backend.app.config import Config
from backend.app.db.connection import query_one, execute

auth_bp = Blueprint("auth", __name__)

COOKIE_NAME = "regit_session"
SESSION_DAYS = Config.SESSION_DAYS


def is_https_request() -> bool:
    """True when the browser-facing origin is HTTPS (cookies need the Secure flag)."""
    if Config.COOKIE_SECURE:
        return True
    proto = (request.headers.get("X-Forwarded-Proto") or request.scheme or "")
    return proto.split(",")[0].strip().lower() == "https"


def create_user_session(user_id: str):
    """Create a session row for the user and return (token, expires_at)."""
    token = secrets.token_urlsafe(32)
    expires = datetime.now() + timedelta(days=SESSION_DAYS)
    execute(
        """
        INSERT INTO sessions (id, user_id, token, expires_at, created_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (str(uuid.uuid4()), user_id, token, expires, datetime.now())
    )
    return token, expires


def set_session_cookie(response, token: str, expires: datetime, secure: bool = False):
    """Attach the session cookie with hardened attributes."""
    response.set_cookie(
        COOKIE_NAME,
        token,
        expires=expires,
        httponly=True,
        samesite="Lax",
        secure=secure,
        path="/",
    )
    return response

def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    derived = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    return f"{salt}:{derived}"

def verify_password(password: str, stored: str) -> bool:
    try:
        parts = stored.split(":")
        if len(parts) != 2:
            return False
        salt, expected = parts
        derived = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
        return hmac.compare_digest(derived, expected)
    except Exception:
        return False

def get_current_user():
    token = request.cookies.get(COOKIE_NAME)
    if not token and request.headers.get("Authorization"):
        auth_head = request.headers.get("Authorization", "")
        if auth_head.startswith("Bearer "):
            token = auth_head.split(" ")[1]

    if not token:
        return None

    session = query_one(
        "SELECT * FROM sessions WHERE token = %s AND expires_at > %s",
        (token, datetime.now())
    )
    if not session:
        return None

    # Include the GitHub columns so callers (e.g. the GitHub endpoints) can read
    # the signed-in user's linked account without a second query.
    user = query_one(
        """
        SELECT id, email, name, avatar_hue, created_at,
               github_token, github_username, github_avatar_url
        FROM users WHERE id = %s
        """,
        (session["user_id"],)
    )
    return user

@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip()
    password = data.get("password") or ""

    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required"}), 400
    if not name or len(name) < 2:
        return jsonify({"error": "Name must be at least 2 characters"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    existing = query_one("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        return jsonify({"error": "An account with that email already exists"}), 409

    user_id = str(uuid.uuid4())
    pw_hash = hash_password(password)
    hue = (sum(ord(c) for c in email) % 360)

    execute(
        """
        INSERT INTO users (id, email, name, password_hash, avatar_hue, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (user_id, email, name, pw_hash, hue, datetime.now())
    )

    # Create session
    token, expires = create_user_session(user_id)

    resp = make_response(jsonify({"ok": True, "user": {"id": user_id, "email": email, "name": name, "avatarHue": hue}}))
    set_session_cookie(resp, token, expires, secure=is_https_request())
    return resp, 201

@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = query_one("SELECT * FROM users WHERE email = %s", (email,))
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    if not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid email or password"}), 401

    token, expires = create_user_session(user["id"])

    resp = make_response(jsonify({
        "ok": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "avatarHue": user["avatar_hue"]
        }
    }))
    set_session_cookie(resp, token, expires, secure=is_https_request())
    return resp

@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    token = request.cookies.get(COOKIE_NAME)
    if token:
        execute("DELETE FROM sessions WHERE token = %s", (token,))
    resp = make_response(jsonify({"ok": True}))
    resp.set_cookie(COOKIE_NAME, "", expires=0, httponly=True, samesite="Lax", path="/")
    return resp

@auth_bp.route("/api/auth/me", methods=["GET"])
def me():
    user = get_current_user()
    if not user:
        return jsonify({"user": None})
    return jsonify({
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "avatarHue": user["avatar_hue"]
        }
    })
