import pytest
from backend.app import create_app

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert data["backend"] == "flask"

def test_repositories_list(client):
    res = client.get("/api/repositories")
    assert res.status_code == 200
    data = res.get_json()
    assert "repositories" in data

def test_seed(client):
    res = client.post("/api/seed")
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert "demoRepoId" in data
