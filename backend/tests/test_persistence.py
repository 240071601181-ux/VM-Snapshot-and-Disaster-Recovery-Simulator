"""
test_persistence.py – Verifies metadata survives application restart.

Strategy: two successive TestClient instances share the same file-based SQLite
database. Data written by the first client is read back correctly by the second
client (simulating a process restart with the same DB file).
"""

import os
import tempfile

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app
from tests.conftest import SAMPLE_AUDIT, SAMPLE_SNAPSHOT, SAMPLE_VM


def _build_client(db_path: str):
    """Build a new TestClient with a fresh session factory bound to db_path."""
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app, raise_server_exceptions=False), engine


def test_vm_record_survives_restart():
    """VM written by client-1 is readable by client-2 (same DB file, new client)."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        # --- First "process" ---
        client1, engine1 = _build_client(db_path)
        resp = client1.post("/api/vms", json=SAMPLE_VM)
        assert resp.status_code == 201
        app.dependency_overrides.clear()

        # --- Second "process" (simulated restart) ---
        client2, engine2 = _build_client(db_path)
        resp2 = client2.get("/api/vms/vm-test-01")
        assert resp2.status_code == 200
        assert resp2.json()["name"] == "test-server"
        app.dependency_overrides.clear()

        Base.metadata.drop_all(bind=engine2)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


def test_snapshot_metadata_survives_restart():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        client1, engine1 = _build_client(db_path)
        resp = client1.post("/api/snapshots", json=SAMPLE_SNAPSHOT)
        assert resp.status_code == 201
        app.dependency_overrides.clear()

        client2, engine2 = _build_client(db_path)
        resp2 = client2.get("/api/snapshots/snap-test-01")
        assert resp2.status_code == 200
        assert resp2.json()["vm_id"] == "vm-test-01"
        app.dependency_overrides.clear()

        Base.metadata.drop_all(bind=engine2)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


def test_audit_event_survives_restart():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        client1, engine1 = _build_client(db_path)
        resp = client1.post("/api/audit", json=SAMPLE_AUDIT)
        assert resp.status_code == 201
        app.dependency_overrides.clear()

        client2, engine2 = _build_client(db_path)
        resp2 = client2.get("/api/audit")
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == "aud-test-01"
        app.dependency_overrides.clear()

        Base.metadata.drop_all(bind=engine2)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


def test_schema_init_is_idempotent():
    """Calling Base.metadata.create_all twice on same DB should not raise."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        client1, engine1 = _build_client(db_path)
        # Second create_all on same engine – must be idempotent
        Base.metadata.create_all(bind=engine1)
        # Verify DB is still functional
        resp = client1.get("/api/vms")
        assert resp.status_code == 200
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine1)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass
