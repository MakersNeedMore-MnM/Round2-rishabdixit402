"""
Branch name and file path validation.

Branch names reach `git clone --branch <name>` as CLI arguments and GitHub API
ref paths; file paths reach the GitHub Contents API. Both are user input at
some point, so both are allowlisted: conservative character sets, no option
injection, no traversal.
"""

import uuid

import pytest
from backend.app import create_app
from backend.app.github.client import validate_branch_name, validate_file_path
from backend.app.db.connection import query_one


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


# ---------------------------------------------------------------------------
# Branch names


@pytest.mark.parametrize("branch", [
    "main",
    "master",
    "develop",
    "feature/login",
    "release/v2.1.0",
    "hotfix_urgent-1",
    "user/xyz/patch+1",
])
def test_valid_branch_names(branch):
    assert validate_branch_name(branch) is True


@pytest.mark.parametrize("branch", [
    "",                                   # empty
    "   ",                                # whitespace
    "--upload-pack=evil",                 # option injection (leading -)
    "-oProxyCommand=evil",
    "main;rm -rf /",                      # shell metacharacters
    "main|curl evil",
    "main&whoami",
    "$(whoami)",
    "`id`",
    "ma\nin",                             # internal newline
    "main..origin/main",                  # ref traversal
    "a//b",                               # doubled slash
    "/leading-slash",
    "trailing-slash/",
    "trailing-dot.",
    ".hidden",
    "main branch",                        # space
    "main\ttab",
    "main~1",                             # tilde not in allowlist
    "main^1",                             # caret not in allowlist
    "main:other",                         # colon (refspec separator)
    "a" * 201,                            # too long
    None,                                 # wrong type
])
def test_invalid_branch_names(branch):
    assert validate_branch_name(branch) is False


# ---------------------------------------------------------------------------
# File paths


@pytest.mark.parametrize("path", [
    "src/app.py",
    "README.md",
    "backend/models/user.py",
    "a/b/c/deep.file-name_v2.ts",
    "docs/my notes.md",                   # spaces inside filenames are legal
])
def test_valid_file_paths(path):
    assert validate_file_path(path) is True


def test_leading_whitespace_and_slashes_are_normalized():
    """
    Leading/trailing whitespace and slashes are stripped before the allowlist
    check, so an absolute-looking path becomes repo-relative - it can never
    escape the repository root. Traversal ('..') is rejected outright.
    """
    assert validate_branch_name("  main  ") is True
    assert validate_file_path("/absolute/path.py") is True  # stored relative


@pytest.mark.parametrize("path", [
    "",                                   # empty
    "..",                                 # traversal
    "../etc/passwd",                      # traversal
    "src/../../etc/passwd",
    "src//app.py",                        # doubled slash -> empty segment
    "src/./app.py",                       # dot segment
    "src/back\\slash.py",                 # backslash
    "src/seg;ment/x",                     # semicolon
    "src/$HOME/x",                        # expansion
    ".git/config",                        # leading dot segment
    "src/" + "a" * 600,                   # too long
    None,
])
def test_invalid_file_paths(path):
    assert validate_file_path(path) is False


# ---------------------------------------------------------------------------
# Enforcement at the endpoints


def register(client):
    email = f"analysis-test-{uuid.uuid4().hex[:10]}@regit.dev"
    res = client.post(
        "/api/auth/register",
        json={"name": "Branch Tester", "email": email, "password": "test-pass-123"},
    )
    assert res.status_code == 201, res.get_json()


def test_connect_rejects_bad_branch(client):
    register(client)
    res = client.post(
        "/api/repositories",
        json={"githubUrl": "https://github.com/acme/repo", "branch": "--upload-pack=evil"},
    )
    assert res.status_code == 400
    assert "branch" in res.get_json()["error"].lower()


def test_connect_rejects_traversal_branch(client):
    register(client)
    res = client.post(
        "/api/repositories",
        json={"githubUrl": "https://github.com/acme/repo", "branch": "main..other"},
    )
    assert res.status_code == 400


def test_connect_accepts_normal_branch(client):
    register(client)
    res = client.post(
        "/api/repositories",
        json={"githubUrl": "https://github.com/acme/repo", "branch": "release/v2"},
    )
    assert res.status_code == 201
    assert res.get_json()["repository"]["branch"] == "release/v2"


def test_github_import_rejects_bad_branch(client):
    register(client)
    res = client.post(
        "/api/github/import",
        json={"githubUrl": "https://github.com/acme/repo", "branch": "$(id)"},
    )
    assert res.status_code == 400


def test_commit_rejects_bad_branch_and_path(client):
    register(client)
    user_id = query_one(
        "SELECT id FROM users WHERE email LIKE 'analysis-test-%%' ORDER BY created_at DESC LIMIT 1"
    )["id"]

    from backend.app.db.connection import execute

    repo_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO repositories (id, user_id, name, github_url, branch, description, status, is_demo, created_at, updated_at)
        VALUES (%s, %s, 'r', 'https://github.com/acme/r', 'main', 'x', 'ready', false, NOW(), NOW())
        """,
        (repo_id, user_id),
    )

    res = client.post(
        f"/api/repositories/{repo_id}/commit",
        json={"filePath": "src/app.py", "content": "x = 1", "branch": "main;reboot"},
    )
    assert res.status_code == 400

    res = client.post(
        f"/api/repositories/{repo_id}/commit",
        json={"filePath": "../../etc/cron.d/evil", "content": "x = 1"},
    )
    assert res.status_code == 400

    # A clean path on a clean branch passes validation (fails later at GitHub
    # token check or the API call itself - but not at validation).
    res = client.post(
        f"/api/repositories/{repo_id}/commit",
        json={"filePath": "src/app.py", "content": "x = 1", "branch": "feature/ok"},
    )
    assert res.status_code in (200, 400)  # only token/GitHub errors past this point
    assert "branch" not in res.get_json().get("error", "").lower()
    assert "path" not in res.get_json().get("error", "").lower()
