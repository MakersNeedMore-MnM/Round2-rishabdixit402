import os
import secrets
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load root .env
root_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(root_dir / ".env")


def _require_env(name: str, description: str) -> str:
    """
    Read a required setting from the environment, or die loudly.

    Hardcoded fallbacks used to ship real values into source control; this
    makes the configuration honest: it comes from the environment (.env or
    the process environment) or the app refuses to start with a clear message
    naming exactly what is missing.
    """
    value = os.getenv(name, "").strip()
    if not value:
        sys.stderr.write(
            f"\n[Config] Missing required environment variable: {name}\n"
            f"         ({description})\n"
            f"         Add it to your .env file - see .env.example.\n\n"
        )
        raise SystemExit(1)
    return value


class Config:
    PORT = int(os.getenv("PORT", "5000"))
    DEBUG = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1")

    # Required: no silent fallbacks. A missing DATABASE_URL or SECRET_KEY is a
    # startup error, never a quietly-wrong default.
    DATABASE_URL = _require_env(
        "DATABASE_URL",
        "PostgreSQL connection string, e.g. postgresql://user:pass@localhost:5432/dbname",
    )
    # Dev nicety: a fresh clone without SECRET_KEY should still boot while
    # FLASK_DEBUG is on, so debug mode falls back to a random per-process key
    # (sessions reset on restart - acceptable in development). Production
    # (FLASK_DEBUG=false) must set SECRET_KEY explicitly.
    _secret = os.getenv("SECRET_KEY", "").strip()
    if not _secret:
        if DEBUG:
            _secret = secrets.token_urlsafe(48)
        else:
            _require_env(
                "SECRET_KEY",
                "Random string used to sign session data (generate: python -c \"import secrets; print(secrets.token_urlsafe(48))\")",
            )
    SECRET_KEY = _secret
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY")
    AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
    GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
    GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
    # Browser-facing base URL. The GitHub OAuth redirect_uri is derived from
    # this (or the forwarded request host) instead of being hardcoded.
    PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "")
    # Full redirect_uri override, wins over PUBLIC_APP_URL when set.
    GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "")
    # Session lifetime in days, and force the Secure cookie flag behind HTTPS.
    SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))
    COOKIE_SECURE = os.getenv("COOKIE_SECURE", "").strip().lower() in ("true", "1", "yes")
    # Browser origins allowed to call this API with credentials (cookies).
    # Comma-separated list; no wildcard - `supports_credentials=True` plus "*"
    # is an invalid/insecure combination that browsers reject anyway.
    # When unset, defaults to the local dev origins.
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ] or ["http://localhost:3000", "http://127.0.0.1:3000"]
