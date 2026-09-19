"""
CORS configuration checks.

The API sets `supports_credentials=True` (session cookies), so the origin list
must be an explicit allowlist - a wildcard origin is both insecure and invalid
with credentials, and browsers reject such responses outright.
"""

import pytest
from backend.app import create_app
from backend.app.config import Config


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_allowed_origin_gets_echoed_with_credentials(client):
    res = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert res.status_code == 200
    assert res.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"
    assert res.headers.get("Access-Control-Allow-Credentials") == "true"


def test_127_0_0_1_origin_is_allowed(client):
    res = client.get("/api/health", headers={"Origin": "http://127.0.0.1:3000"})
    assert res.headers.get("Access-Control-Allow-Origin") == "http://127.0.0.1:3000"


def test_unknown_origin_is_not_granted_access(client):
    res = client.get("/api/health", headers={"Origin": "https://evil.example.com"})
    assert res.headers.get("Access-Control-Allow-Origin") != "https://evil.example.com"
    assert res.headers.get("Access-Control-Allow-Credentials") != "true"


def test_preflight_from_allowed_origin_succeeds(client):
    res = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert res.status_code == 200
    assert res.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"
    assert res.headers.get("Access-Control-Allow-Credentials") == "true"
    assert "POST" in res.headers.get("Access-Control-Allow-Methods", "")


def test_preflight_from_unknown_origin_is_rejected(client):
    res = client.options(
        "/api/auth/login",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.headers.get("Access-Control-Allow-Origin") != "https://evil.example.com"


def test_wildcard_is_not_in_the_origin_allowlist():
    """The allowlist must never contain '*' alongside credentials."""
    assert "*" not in Config.CORS_ORIGINS


def test_cors_origins_env_override(monkeypatch):
    """Operators can pin production origins through CORS_ORIGINS."""
    monkeypatch.setenv("CORS_ORIGINS", "https://regit.example.com, https://regit.io")
    import importlib
    from backend.app import config

    importlib.reload(config)
    try:
        assert config.Config.CORS_ORIGINS == ["https://regit.example.com", "https://regit.io"]
    finally:
        importlib.reload(config)  # restore for other tests
