import uuid
from unittest.mock import patch

import pytest
from backend.app import create_app
from backend.app.analysis.service import claim_pending_scans
from backend.app.db.connection import execute, execute_many, query_all


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def create_repo(client, monkeypatch):
    """
    Register a throwaway user and import one repository entry.

    The `queued_scans` fixture stubs the scan queue, so nothing is cloned and
    no worker starts - the test only cares about the Scan action itself.
    """
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_test_token")
    email = f"analysis-test-{uuid.uuid4().hex[:10]}@regit.dev"
    res = client.post(
        "/api/auth/register",
        json={"name": "Analysis Tester", "email": email, "password": "test-pass-123"},
    )
    assert res.status_code == 201, res.get_json()

    url = f"https://github.com/acme/repo-{uuid.uuid4().hex[:8]}"
    with patch("backend.app.api.github.list_github_repos") as mock_list:
        mock_list.return_value = {
            "ok": True,
            "repositories": [
                {
                    "name": "probe",
                    "html_url": url,
                    "default_branch": "main",
                    "description": "probe",
                }
            ],
        }
        assert client.post("/api/github/import-repos").status_code == 200

    repos = client.get("/api/repositories").get_json()["repositories"]
    match = next(r for r in repos if r["githubUrl"] == url)

    # Import queues a scan and marks the repository 'analyzing'. These tests are
    # about the Scan action itself, so put the repository back to rest first.
    execute("UPDATE repositories SET status = 'pending' WHERE id = %s", (match["id"],))
    return match["id"]


@patch("backend.app.api.analysis.start_analysis_async")
def test_analyze_returns_immediately(mock_start, client, monkeypatch):
    """The scan must be delegated, never awaited inside the request."""
    repo_id = create_repo(client, monkeypatch)

    res = client.post(f"/api/repositories/{repo_id}/analyze")

    assert res.status_code == 202
    body = res.get_json()
    assert body["ok"] is True
    assert body["status"] == "analyzing"
    mock_start.assert_called_once_with(repo_id)

    # Status flips straight away so the UI has something to poll
    repo = client.get(f"/api/repositories/{repo_id}").get_json()["repository"]
    assert repo["status"] == "analyzing"


@patch("backend.app.api.analysis.start_analysis_async")
def test_analyze_does_not_start_a_second_scan(mock_start, client, monkeypatch):
    repo_id = create_repo(client, monkeypatch)

    assert client.post(f"/api/repositories/{repo_id}/analyze").status_code == 202
    again = client.post(f"/api/repositories/{repo_id}/analyze")

    assert again.status_code == 202
    assert again.get_json()["alreadyRunning"] is True
    assert mock_start.call_count == 1


def test_analyze_requires_authentication(client):
    """Scanning is an owner action, so anonymous callers are rejected first."""
    res = client.post(f"/api/repositories/{uuid.uuid4()}/analyze")
    assert res.status_code == 401


@patch("backend.app.analysis.service.analyze_repository_full")
def test_failed_scan_marks_repository_as_error(mock_full, client, monkeypatch):
    """A crashing scan must never leave the repository stuck on 'analyzing'."""
    from backend.app.analysis.service import _run_analysis_safe

    repo_id = create_repo(client, monkeypatch)
    mock_full.side_effect = RuntimeError("clone failed")

    # _run_analysis_safe is exactly what the background thread executes
    _run_analysis_safe(repo_id)

    repo = client.get(f"/api/repositories/{repo_id}").get_json()["repository"]
    assert repo["status"] == "error"


def test_waiting_repositories_are_picked_up_for_scanning(client, monkeypatch):
    """
    A waiting repository must be swept up for scanning - that is what keeps an
    imported repository from sitting at 'pending' with an empty file list.
    """
    repo_id = create_repo(client, monkeypatch)

    assert repo_id in claim_pending_scans(limit=10_000)

    # The status stays honest until a worker really starts on it
    repo = client.get(f"/api/repositories/{repo_id}").get_json()["repository"]
    assert repo["status"] == "pending"


def test_a_queued_repository_is_never_queued_twice(monkeypatch):
    """Two sweeps in a row must not kick off the same scan twice."""
    from backend.app.analysis import service

    monkeypatch.setattr(
        service,
        "query_all",
        lambda *args, **kwargs: [{"id": "queued-repo"}, {"id": "waiting-repo"}],
    )
    with service._inflight_lock:
        service._inflight.add("queued-repo")
    try:
        assert service.claim_pending_scans(limit=10) == ["waiting-repo"]
    finally:
        with service._inflight_lock:
            service._inflight.discard("queued-repo")


def test_execute_many_writes_every_row(client, monkeypatch):
    """
    Scans write thousands of rows; batching them into one statement is what
    took a 37-file scan from ~110s to ~5s.
    """
    repo_id = create_repo(client, monkeypatch)
    paths = [f"module_{i}.py" for i in range(150)]

    execute_many(
        """
        INSERT INTO repo_files (id, repository_id, path, language, content, loc, status)
        VALUES %s
        """,
        [(str(uuid.uuid4()), repo_id, p, "python", "print(1)\n", 1, "analyzed") for p in paths]
    )

    stored = query_all("SELECT path FROM repo_files WHERE repository_id = %s", (repo_id,))
    assert sorted(r["path"] for r in stored) == sorted(paths)

    # Nothing is written for an empty batch
    execute_many("INSERT INTO repo_files (id, repository_id, path, language, content, loc, status) VALUES %s", [])
    assert len(query_all("SELECT id FROM repo_files WHERE repository_id = %s", (repo_id,))) == 150
