"""
Ownership and authorization checks for the repository-scoped API.

The rules under test:

- Anonymous visitors may read the public demo repository (the walkthrough),
  and nothing else; every mutation requires a signed-in owner.
- A signed-in user can never touch another user's repository or its rows:
  those answers look exactly like a missing repository (404).
"""

import uuid

import pytest
from backend.app import create_app
from backend.app.db.connection import execute, query_one


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def register(client, name="Owner Tester"):
    """Register a throwaway account; the test client keeps the session cookie."""
    email = f"analysis-test-{uuid.uuid4().hex[:10]}@regit.dev"
    res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "test-pass-123"},
    )
    assert res.status_code == 201, res.get_json()
    return query_one("SELECT id FROM users WHERE email = %s", (email,))["id"]


def make_repo(user_id, *, is_demo=False):
    """Insert a repository row directly, bypassing scan queueing."""
    repo_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO repositories (id, user_id, name, github_url, branch, description, status, is_demo, created_at, updated_at)
        VALUES (%s, %s, 'owned-repo', 'https://github.com/acme/owned', 'main', 'test', 'ready', %s, NOW(), NOW())
        """,
        (repo_id, user_id, is_demo),
    )
    return repo_id


@pytest.fixture
def two_users_with_repos(client):
    """Two signed-in users, each owning one repository (cookie = user B)."""
    user_a = register(client, "Alice")
    user_b = register(client, "Bob")
    repo_a = make_repo(user_a)
    repo_b = make_repo(user_b)
    # The session cookie now belongs to whoever registered last (Bob).
    return user_a, user_b, repo_a, repo_b


# ---------------------------------------------------------------------------
# Repository-level endpoints


def test_anonymous_cannot_delete_any_repository(client, two_users_with_repos):
    client.post("/api/auth/logout")
    _, _, repo_a, _ = two_users_with_repos
    res = client.delete(f"/api/repositories/{repo_a}")
    assert res.status_code == 401
    assert query_one("SELECT id FROM repositories WHERE id = %s", (repo_a,)) is not None


def test_owner_can_delete_their_repository(client, two_users_with_repos):
    _, _, _, repo_b = two_users_with_repos
    assert client.delete(f"/api/repositories/{repo_b}").status_code == 200
    assert query_one("SELECT id FROM repositories WHERE id = %s", (repo_b,)) is None


def test_stranger_sees_not_found_for_foreign_repository(client, two_users_with_repos):
    """Bob must not be able to delete Alice's repository - 404, not 403."""
    _, _, repo_a, _ = two_users_with_repos
    res = client.delete(f"/api/repositories/{repo_a}")
    assert res.status_code == 404
    assert query_one("SELECT id FROM repositories WHERE id = %s", (repo_a,)) is not None


def test_stranger_cannot_read_foreign_repository(client, two_users_with_repos):
    _, _, repo_a, _ = two_users_with_repos
    assert client.get(f"/api/repositories/{repo_a}").status_code == 404
    assert client.get(f"/api/repositories/{repo_a}/overview").status_code == 404
    assert client.get(f"/api/repositories/{repo_a}/files").status_code == 404
    assert client.get(f"/api/repositories/{repo_a}/graph").status_code == 404
    assert client.get(f"/api/repositories/{repo_a}/changes").status_code == 404


def test_owner_can_read_their_repository(client, two_users_with_repos):
    _, _, _, repo_b = two_users_with_repos
    assert client.get(f"/api/repositories/{repo_b}").status_code == 200
    assert client.get(f"/api/repositories/{repo_b}/overview").status_code == 200
    assert client.get(f"/api/repositories/{repo_b}/files").status_code == 200


def test_rename_requires_the_owner(client, two_users_with_repos):
    _, _, repo_a, repo_b = two_users_with_repos
    assert (
        client.patch(
            f"/api/repositories/{repo_a}", json={"name": "hijacked"}
        ).status_code
        == 404
    )
    assert client.patch(f"/api/repositories/{repo_b}", json={"name": "renamed"}).status_code == 200
    assert query_one("SELECT name FROM repositories WHERE id = %s", (repo_b,))["name"] == "renamed"


def test_anonymous_cannot_rename(client, two_users_with_repos):
    client.post("/api/auth/logout")
    _, _, repo_a, _ = two_users_with_repos
    res = client.patch(f"/api/repositories/{repo_a}", json={"name": "anon-rename"})
    assert res.status_code == 401


def test_analyze_requires_the_owner(client, two_users_with_repos):
    _, _, repo_a, repo_b = two_users_with_repos
    assert client.post(f"/api/repositories/{repo_a}/analyze").status_code == 404
    # Bob may scan his own repository; the scan itself is stubbed by conftest.
    assert client.post(f"/api/repositories/{repo_b}/analyze").status_code == 202


def test_commit_requires_the_owner(client, two_users_with_repos):
    _, _, repo_a, _ = two_users_with_repos
    res = client.post(
        f"/api/repositories/{repo_a}/commit",
        json={"filePath": "a.py", "content": "x = 1"},
    )
    assert res.status_code == 404


def test_file_update_requires_the_owner(client, two_users_with_repos):
    _, _, repo_a, repo_b = two_users_with_repos
    file_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO repo_files (id, repository_id, path, language, content, loc, status)
        VALUES (%s, %s, 'a.py', 'python', 'x = 1', 1, 'analyzed')
        """,
        (file_id, repo_a),
    )
    res = client.put(
        f"/api/repositories/{repo_a}/files/{file_id}", json={"content": "x = 2"}
    )
    assert res.status_code == 404


def test_connecting_requires_sign_in(client):
    client.post("/api/auth/logout")
    res = client.post(
        "/api/repositories", json={"githubUrl": "https://github.com/acme/repo"}
    )
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# Item-level endpoints (findings, cleanup)


def seed_finding_and_cleanup(repo_id):
    finding_id = str(uuid.uuid4())
    cleanup_id = str(uuid.uuid4())
    execute(
        """
        INSERT INTO findings (id, repository_id, rule_id, severity, title, description, evidence, file_path, line_start, line_end, status)
        VALUES (%s, %s, 'rule.test', 'high', 't', 'd', '[]'::jsonb, 'a.py', 1, 2, 'open')
        """,
        (finding_id, repo_id),
    )
    execute(
        """
        INSERT INTO cleanup_items (id, repository_id, type, target, file_path, confidence, description, status)
        VALUES (%s, %s, 'dead_code', 'fn', 'a.py', 'high', 'd', 'pending')
        """,
        (cleanup_id, repo_id),
    )
    return finding_id, cleanup_id


def test_stranger_cannot_dismiss_foreign_finding(client, two_users_with_repos):
    _, _, repo_a, _ = two_users_with_repos
    finding_id, _ = seed_finding_and_cleanup(repo_a)

    res = client.patch(f"/api/findings/{finding_id}", json={"status": "dismissed"})
    assert res.status_code == 404
    assert query_one("SELECT status FROM findings WHERE id = %s", (finding_id,))["status"] == "open"


def test_owner_can_dismiss_their_finding(client, two_users_with_repos):
    _, _, _, repo_b = two_users_with_repos
    finding_id, _ = seed_finding_and_cleanup(repo_b)

    res = client.patch(f"/api/findings/{finding_id}", json={"status": "dismissed"})
    assert res.status_code == 200
    assert query_one("SELECT status FROM findings WHERE id = %s", (finding_id,))["status"] == "dismissed"


def test_anonymous_cannot_dismiss_any_finding(client, two_users_with_repos):
    client.post("/api/auth/logout")
    _, _, repo_a, _ = two_users_with_repos
    finding_id, _ = seed_finding_and_cleanup(repo_a)
    assert client.patch(f"/api/findings/{finding_id}", json={"status": "dismissed"}).status_code == 401


def test_stranger_cannot_mutate_foreign_cleanup_item(client, two_users_with_repos):
    _, _, repo_a, _ = two_users_with_repos
    _, cleanup_id = seed_finding_and_cleanup(repo_a)

    assert client.patch(f"/api/cleanup/{cleanup_id}", json={"status": "approved"}).status_code == 404
    assert client.delete(f"/api/cleanup/{cleanup_id}").status_code == 404
    assert query_one("SELECT id FROM cleanup_items WHERE id = %s", (cleanup_id,)) is not None


def test_owner_can_mutate_their_cleanup_item(client, two_users_with_repos):
    _, _, _, repo_b = two_users_with_repos
    _, cleanup_id = seed_finding_and_cleanup(repo_b)

    assert client.patch(f"/api/cleanup/{cleanup_id}", json={"status": "approved"}).status_code == 200
    assert client.delete(f"/api/cleanup/{cleanup_id}").status_code == 200


# ---------------------------------------------------------------------------
# Demo walkthrough stays readable for anonymous visitors


def test_anonymous_can_read_the_demo_repository(client):
    res = client.post("/api/seed")
    assert res.status_code == 200
    demo_repo_id = res.get_json()["demoRepoId"]

    client.post("/api/auth/logout")

    assert client.get(f"/api/repositories/{demo_repo_id}").status_code == 200
    assert client.get(f"/api/repositories/{demo_repo_id}/overview").status_code == 200
    assert client.get(f"/api/repositories/{demo_repo_id}/findings").status_code == 200
    assert client.get(f"/api/repositories/{demo_repo_id}/cleanup").status_code == 200


def test_anonymous_still_cannot_mutate_the_demo_repository(client):
    res = client.post("/api/seed")
    demo_repo_id = res.get_json()["demoRepoId"]
    client.post("/api/auth/logout")

    assert client.delete(f"/api/repositories/{demo_repo_id}").status_code == 401
    assert client.post(f"/api/repositories/{demo_repo_id}/analyze").status_code == 401
    assert client.post(
        f"/api/repositories/{demo_repo_id}/commit", json={"filePath": "x", "content": "y"}
    ).status_code == 401


def test_non_demo_repositories_are_invisible_to_anonymous(client, two_users_with_repos):
    client.post("/api/auth/logout")
    _, _, repo_a, _ = two_users_with_repos
    # 404 (not 401/403) on purpose: an anonymous caller is not told whether
    # the repository exists at all.
    assert client.get(f"/api/repositories/{repo_a}").status_code == 404
    assert client.get(f"/api/repositories/{repo_a}/findings").status_code == 404
    assert client.delete(f"/api/repositories/{repo_a}").status_code == 401
