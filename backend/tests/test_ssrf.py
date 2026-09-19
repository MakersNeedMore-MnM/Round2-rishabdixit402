"""
SSRF protection on user-supplied GitHub URLs.

The rules under test:

- Only well-formed github.com repository URLs parse at all; every other host,
  scheme, or malformed input is rejected by the single choke point
  (parse_github_url / canonical_*).
- URL inputs at the API boundary are canonicalized before being stored.
- The clone path never receives a verbatim stored URL: it is rebuilt from
  validated components, so no other host can ever reach the git client.
"""

import uuid
from unittest.mock import patch

import pytest
from backend.app import create_app
from backend.app.db.connection import query_one, execute
from backend.app.github.client import (
    parse_github_url,
    canonical_github_url,
    canonical_clone_url,
)


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


# ---------------------------------------------------------------------------
# parse_github_url: the choke point


@pytest.mark.parametrize("url,expected", [
    ("https://github.com/facebook/react", ("facebook", "react")),
    ("https://github.com/facebook/react.git", ("facebook", "react")),
    ("https://github.com/facebook/react/tree/main/src", ("facebook", "react")),
    ("https://www.github.com/facebook/react", ("facebook", "react")),
    ("HTTPS://GITHUB.COM/facebook/react", ("facebook", "react")),
    ("git@github.com:facebook/react.git", ("facebook", "react")),
    ("git@github.com:facebook/react", ("facebook", "react")),
])
def test_valid_github_urls_parse(url, expected):
    assert parse_github_url(url) == expected


@pytest.mark.parametrize("url", [
    "https://evil.example.com/facebook/react",        # different host
    "https://github.com.evil.example.com/a/b",        # lookalike host
    "https://192.168.1.10/a/b",                       # internal host by IP
    "http://localhost:5000/a/b",                      # internal service
    "http://127.0.0.1:6379/x",                        # loopback
    "https://gitea.internal/acme/repo",               # private git host
    "git@gitlab.com:facebook/react.git",              # SSH to other host
    "git@internal-git.local:acme/repo.git",           # SSH to internal host
    "ftp://github.com/a/b",                           # odd scheme
    "https://github.com/a/b?next=http://internal",    # query tricks still parse host correctly
    "invalid_url",
    "",
    "   ",
])
def test_non_github_or_malformed_urls_do_not_parse(url):
    assert parse_github_url(url) is None


@pytest.mark.parametrize("url", [
    "https://github.com/../etc/passwd",               # traversal in owner
    "https://github.com/a b/c",                       # space
    "https://github.com/$()/{cmd}/c",                 # shell-ish garbage
])
def test_traversal_and_unsafe_components_rejected(url):
    # These either fail to parse or get filtered by component validation,
    # but in every case they must not produce usable components.
    assert parse_github_url(url) is None


def test_traversal_in_trailing_path_is_discarded():
    """
    A trailing '/..' segment is just ignored path noise (like /tree/x) - the
    repository resolves to a/b, and canonical_clone_url rebuilds the URL from
    owner/repo only, so traversal never reaches the git client.
    """
    assert parse_github_url("https://github.com/a/b/../../x") == ("a", "b")
    assert canonical_github_url("https://github.com/a/b/../../x") == "https://github.com/a/b"


# ---------------------------------------------------------------------------
# canonical_* helpers


def test_canonical_github_url_normalizes():
    assert canonical_github_url("https://github.com/FB/React.Git") == "https://github.com/FB/React"
    assert canonical_github_url("https://github.com/fb/react/tree/dev") == "https://github.com/fb/react"
    assert canonical_github_url("http://localhost/x/y") is None


def test_canonical_clone_url_without_token():
    assert canonical_clone_url("https://github.com/fb/react") == "https://github.com/fb/react.git"


def test_canonical_clone_url_with_token():
    url = canonical_clone_url("https://github.com/fb/react", "ghp_token123")
    assert url == "https://x-access-token:ghp_token123@github.com/fb/react.git"


def test_canonical_clone_url_rejects_everything_else():
    assert canonical_clone_url("http://169.254.169.254/latest") is None
    assert canonical_clone_url("git@evil.com:fb/react.git") is None
    assert canonical_clone_url("") is None


# ---------------------------------------------------------------------------
# API boundary: storing a repository


def register(client):
    email = f"analysis-test-{uuid.uuid4().hex[:10]}@regit.dev"
    res = client.post(
        "/api/auth/register",
        json={"name": "SSRF Tester", "email": email, "password": "test-pass-123"},
    )
    assert res.status_code == 201, res.get_json()


def test_connect_rejects_non_github_url(client):
    register(client)
    res = client.post("/api/repositories", json={"githubUrl": "http://internal.local:5000/x/y"})
    assert res.status_code == 400
    assert "github.com" in res.get_json()["error"]


def test_connect_rejects_lookalike_host(client):
    register(client)
    res = client.post("/api/repositories", json={"githubUrl": "https://github.com.evil.example.com/a/b"})
    assert res.status_code == 400


def test_connect_stores_canonical_url(client):
    register(client)
    res = client.post(
        "/api/repositories",
        json={"githubUrl": "https://github.com/facebook/react/tree/main?x=1"},
    )
    assert res.status_code == 201, res.get_json()
    stored = res.get_json()["repository"]["githubUrl"]
    assert stored == "https://github.com/facebook/react"


def test_github_import_rejects_non_github_url(client):
    register(client)
    res = client.post("/api/github/import", json={"githubUrl": "https://gitlab.com/fb/react"})
    assert res.status_code == 400


def test_scan_refuses_to_clone_non_github_urls(client):
    """
    Even if a non-github URL somehow lands in the database (old row, manual
    edit, bypassed boundary), the scan path must refuse to clone it.
    """
    register(client)
    user_id = query_one(
        "SELECT id FROM users WHERE email LIKE 'analysis-test-%%' ORDER BY created_at DESC LIMIT 1"
    )["id"]
    repo_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO repositories (id, user_id, name, github_url, branch, description, status, is_demo, created_at, updated_at)
        VALUES (%s, %s, 'evil-repo', 'http://169.254.169.254/latest/meta-data', 'main', 'x', 'pending', false, NOW(), NOW())
        """,
        (repo_id, user_id),
    )

    with patch("backend.app.analysis.service._shallow_clone") as mock_clone:
        from backend.app.analysis.service import analyze_repository_full

        # The refusal surfaces as the generic scan failure...
        with pytest.raises(ValueError):
            analyze_repository_full(repo_id)

        # ...but the real assertion: the clone was never attempted against
        # the internal host.
        mock_clone.assert_not_called()


def test_scan_clone_target_is_canonical(client):
    """For a real github.com repository the clone URL is rebuilt, verbatim-free."""
    register(client)
    user_id = query_one(
        "SELECT id FROM users WHERE email LIKE 'analysis-test-%%' ORDER BY created_at DESC LIMIT 1"
    )["id"]
    repo_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO repositories (id, user_id, name, github_url, branch, description, status, is_demo, created_at, updated_at)
        VALUES (%s, %s, 'good-repo', 'https://github.com/acme/good', 'main', 'x', 'pending', false, NOW(), NOW())
        """,
        (repo_id, user_id),
    )

    from backend.app.analysis.service import analyze_repository_full

    captured = {}

    def fake_clone(url, branch, dest):
        captured["url"] = url
        return False  # skip actual parsing; we only care about the URL

    with patch("backend.app.analysis.service._shallow_clone", side_effect=fake_clone):
        with pytest.raises(ValueError):
            analyze_repository_full(repo_id)  # clone returns False -> error out

    assert captured["url"] == "https://github.com/acme/good.git"
