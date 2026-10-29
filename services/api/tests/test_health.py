from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db


def test_health_check_success(client: TestClient):
    """Verify that GET /health returns 200 with service and database operational status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "sentinel-exam-api"
    assert data["database"] == "connected"
    assert "version" in data


def test_health_check_database_failure():
    """Verify that GET /health returns 503 if database readiness check fails."""
    def broken_db_override():
        class BrokenSession:
            def execute(self, statement):
                raise RuntimeError("Simulated database connection drop")
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db_override
    try:
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 503
            assert "detail" in response.json()
    finally:
        app.dependency_overrides.clear()
