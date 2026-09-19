import uuid
from unittest.mock import MagicMock, patch

import pytest
from backend.app import create_app
from backend.app.github.client import parse_github_url


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def register(client):
    """Register a throwaway account; the test client keeps the session cookie."""
    email = f"oauth-test-{uuid.uuid4().hex[:10]}@regit.dev"
    res = client.post(
        "/api/auth/register",
        json={"name": "OAuth Tester", "email": email, "password": "test-pass-123"},
    )
    assert res.status_code == 201, res.get_json()
    return email


def test_parse_github_url():
    assert parse_github_url("https://github.com/facebook/react") == ("facebook", "react")
    assert parse_github_url("https://github.com/facebook/react.git") == ("facebook", "react")
    assert parse_github_url("git@github.com:facebook/react.git") == ("facebook", "react")
    assert parse_github_url("invalid_url") is None


def test_github_endpoints_require_auth(client):
    """An anonymous caller must not reach the connected GitHub account."""
    assert client.get("/api/github/status").status_code == 401
    assert client.get("/api/github/repos").status_code == 401
    assert client.post("/api/github/connect", json={"token": "ghp_x"}).status_code == 401
    assert client.post("/api/github/disconnect").status_code == 401


def test_github_status_endpoint(client):
    register(client)
    res = client.get("/api/github/status")
    assert res.status_code == 200
    data = res.get_json()
    assert "connected" in data


@patch("backend.app.github.client.requests.get")
def test_mock_github_connect(mock_get, client):
    register(client)

    # Mock /user response
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "login": "octocat",
        "name": "The Octocat",
        "avatar_url": "https://github.com/images/error/octocat_happy.gif",
        "public_repos": 8,
        "total_private_repos": 2,
    }
    mock_get.return_value.headers = {"X-OAuth-Scopes": "repo, read:user"}

    res = client.post("/api/github/connect", json={"token": "ghp_mocktoken1234567890"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert data["user"]["login"] == "octocat"

    # Status should now reflect connected
    status_res = client.get("/api/github/status")
    assert status_res.status_code == 200
    assert status_res.get_json()["connected"] is True
    assert status_res.get_json()["username"] == "octocat"

    # Disconnect
    disc_res = client.post("/api/github/disconnect")
    assert disc_res.status_code == 200
    assert disc_res.get_json()["ok"] is True


@patch("backend.app.api.github.list_github_repos")
def test_github_import_all_queues_a_scan_per_repository(mock_list, client, monkeypatch, queued_scans):
    """
    Importing writes one entry per repository and queues its scan.

    The write itself stays metadata-only - cloning and indexing always happen
    in the background, so importing can never block on a repository's size.
    """
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_import_token")
    register(client)

    unique = uuid.uuid4().hex[:10]
    alpha = f"https://github.com/acme/alpha-{unique}"
    mock_list.return_value = {
        "ok": True,
        "repositories": [
            {
                "name": f"alpha-{unique}",
                "html_url": alpha,
                "default_branch": "main",
                "description": "Alpha repo",
            },
            {
                "name": f"beta-{unique}",
                "html_url": f"https://github.com/acme/beta-{unique}",
                "default_branch": "dev",
                "description": None,
            },
        ],
    }

    res = client.post("/api/github/import-repos")
    assert res.status_code == 200
    assert res.get_json()["imported"] == 2

    # Safe to call again: nothing is duplicated
    assert client.post("/api/github/import-repos").get_json()["imported"] == 0

    repos = client.get("/api/repositories").get_json()["repositories"]
    imported = [r for r in repos if r["githubUrl"] == alpha]
    assert len(imported) == 1
    assert imported[0]["branch"] == "main"
    # Queued for scanning, so the UI can show progress immediately
    assert imported[0]["status"] == "analyzing"

    # Every imported repository asked for a scan, exactly once
    queued = [call.args[0] for call in queued_scans.call_args_list]
    assert sorted(queued) == sorted(r["id"] for r in repos if r["githubUrl"] in {alpha, f"https://github.com/acme/beta-{unique}"})

    # Files arrive from the background worker, never from the import request
    files_res = client.get(f"/api/repositories/{imported[0]['id']}/files")
    assert files_res.status_code == 200
    assert files_res.get_json()["files"] == []


def test_github_import_all_requires_auth(client):
    assert client.post("/api/github/import-repos").status_code == 401


def test_github_oauth_login_redirects_with_state(client, monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("PUBLIC_APP_URL", "http://localhost:3000")

    res = client.get("/api/github/login")
    assert res.status_code == 302

    location = res.headers["Location"]
    assert location.startswith("https://github.com/login/oauth/authorize?")
    assert "client_id=test-client-id" in location
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fgithub%2Fcallback" in location

    # The issued state is bound to this browser through an httpOnly cookie
    state_cookie = client.get_cookie("regit_oauth_state")
    assert state_cookie is not None
    assert state_cookie.value in location


def test_github_oauth_login_uses_forwarded_host(client, monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.delenv("PUBLIC_APP_URL", raising=False)
    monkeypatch.delenv("GITHUB_REDIRECT_URI", raising=False)

    res = client.get(
        "/api/github/login",
        headers={"X-Forwarded-Host": "regit.example.com", "X-Forwarded-Proto": "https"},
    )
    assert res.status_code == 302
    assert (
        "redirect_uri=https%3A%2F%2Fregit.example.com%2Fapi%2Fgithub%2Fcallback"
        in res.headers["Location"]
    )


def test_github_oauth_login_without_credentials(client, monkeypatch):
    monkeypatch.delenv("GITHUB_CLIENT_ID", raising=False)
    monkeypatch.setattr("backend.app.api.github.Config.GITHUB_CLIENT_ID", "")

    res = client.get("/api/github/login")
    assert res.status_code == 302
    assert res.headers["Location"] == "/login?error=github_not_configured"


def test_github_oauth_callback_rejects_forged_state(client, monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test-client-secret")

    res = client.get("/api/github/callback?code=abc&state=forged")
    assert res.status_code == 302
    assert res.headers["Location"] == "/login?error=github_state_mismatch"


@patch("backend.app.github.client.requests.get")
@patch("backend.app.api.github.requests.post")
def test_github_oauth_callback_signs_the_user_in(mock_post, mock_get, client, monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("PUBLIC_APP_URL", "http://localhost:3000")

    # 1. GitHub exchanges the temporary code for an access token
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"access_token": "gho_test_token"}

    unique = uuid.uuid4().hex[:10]
    login_name = f"oauth-{unique}"
    primary_email = f"oauth-{unique}@example.com"

    # 2a. GET /user -> profile with a hidden email, 2b. GET /user/emails -> verified email
    profile = MagicMock()
    profile.status_code = 200
    profile.headers = {"X-OAuth-Scopes": "user:email, repo"}
    profile.json.return_value = {
        "login": login_name,
        "name": "OAuth Tester",
        "email": None,
        "avatar_url": "https://avatars.githubusercontent.com/u/1",
        "public_repos": 3,
    }

    emails = MagicMock()
    emails.status_code = 200
    emails.json.return_value = [
        {"email": primary_email, "primary": True, "verified": True},
    ]
    mock_get.side_effect = [profile, emails]

    # Start the flow so we hold a valid, cookie-bound state value
    assert client.get("/api/github/login").status_code == 302
    state = client.get_cookie("regit_oauth_state").value

    cb = client.get(f"/api/github/callback?code=temp-code&state={state}")
    assert cb.status_code == 302
    # Lands on the repositories screen so the account's repos can be listed
    assert cb.headers["Location"] == "/dashboard/repositories?github=connected"

    # The state is consumed by the callback and cannot be replayed
    state_after = client.get_cookie("regit_oauth_state")
    assert state_after is None or state_after.value != state
    replay = client.get(f"/api/github/callback?code=temp-code&state={state}")
    assert replay.headers["Location"] == "/login?error=github_state_mismatch"

    # A real session was created for the account GitHub identified
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["user"]["email"] == primary_email

    # The OAuth token is linked so import / commit keep working
    status = client.get("/api/github/status")
    assert status.get_json()["username"] == login_name

    # A GitHub-only account has no usable password
    client.post("/api/auth/logout")
    bad = client.post(
        "/api/auth/login", json={"email": primary_email, "password": "anything"}
    )
    assert bad.status_code == 401


def test_repo_files_endpoint(client):
    # Get any repo ID from database
    repos_res = client.get("/api/repositories")
    assert repos_res.status_code == 200
    repos = repos_res.get_json().get("repositories", [])
    if repos:
        repo_id = repos[0]["id"]
        files_res = client.get(f"/api/repositories/{repo_id}/files")
        assert files_res.status_code == 200
        assert "files" in files_res.get_json()
