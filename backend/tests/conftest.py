"""
conftest.py – Shared pytest fixtures for the backend test suite.

Each test function gets a fresh in-memory SQLite database to guarantee isolation.
The TestClient is synchronous (httpx-based) which is all we need for sync FastAPI.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app


def _make_test_client(db_url: str = "sqlite:///:memory:") -> tuple:
    """Create a fresh engine, session factory, and patched TestClient."""
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Create tables on the fresh engine
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app, raise_server_exceptions=False)
    return client, engine


@pytest.fixture()
def client():
    """Fresh in-memory DB + TestClient per test function."""
    c, engine = _make_test_client()
    yield c
    # Cleanup
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


# Sample payloads shared across tests
SAMPLE_VM = {
    "id": "vm-test-01",
    "name": "test-server",
    "description": "Unit test VM",
    "environment": "staging",
    "os": "Ubuntu 24.04 LTS",
    "hardware": {"cpu_cores": 4, "memory_mb": 8192, "disk_size_gb": 100},
}

SAMPLE_SNAPSHOT = {
    "id": "snap-test-01",
    "vm_id": "vm-test-01",
    "vm_name": "test-server",
    "name": "Test Snapshot",
    "description": "[MOCK SIMULATION DATA] Baseline snapshot for tests",
    "size_bytes": 1073741824,
    "is_consistent": True,
}

SAMPLE_RECOVERY = {
    "id": "rec-test-01",
    "vm_id": "vm-test-01",
    "vm_name": "test-server",
    "target_snapshot_id": "snap-test-01",
    "target_snapshot_name": "Test Snapshot",
    "status": "initiated",
    "calculated_rto_seconds": 120.0,
    "calculated_rpo_seconds": 3600.0,
}

SAMPLE_AUDIT = {
    "id": "aud-test-01",
    "type": "vm_created",
    "vm_id": "vm-test-01",
    "vm_name": "test-server",
    "title": "VM Created: test-server",
    "details": "Unit test audit event",
    "operator": "pytest-runner",
    "severity": "info",
}
