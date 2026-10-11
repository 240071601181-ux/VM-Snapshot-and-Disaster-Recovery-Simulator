"""
test_failure_recovery.py – Phase 5 tests for failure simulation + DR workflow.

Covers: all five injection scenarios, successful/unsuccessful recovery,
invalid inputs, snapshot ownership, missing resources, concurrency safety,
audit logging, history preservation, and DB-error handling.
"""

import threading
from unittest.mock import MagicMock

from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from main import app
from tests.conftest import SAMPLE_VM


def _vm(client, vm_id="vm-dr-01", **overrides):
    payload = {**SAMPLE_VM, "id": vm_id, "name": f"name-{vm_id}", **overrides}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _take(client, vm_id, name="dr-snap"):
    resp = client.post(f"/api/vms/{vm_id}/snapshots", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _inject(client, vm_id, scenario, status=201):
    resp = client.post("/api/failures", json={"vm_id": vm_id, "scenario": scenario})
    assert resp.status_code == status, resp.text
    return resp.json() if status == 201 else resp


def _power(client, vm_id):
    return client.get(f"/api/vms/{vm_id}").json()["power_state"]


# ---------------------------------------------------------------------------
# Failure injection scenarios
# ---------------------------------------------------------------------------

def test_inject_application_crash(client):
    _vm(client, power_state="running")
    event = _inject(client, "vm-dr-01", "application_crash")
    assert event["vm_id"] == "vm-dr-01"
    assert event["scenario"] == "application_crash"
    assert event["failure_type"] == "service_crash"
    assert event["auto_recoverable"] is True
    assert _power(client, "vm-dr-01") == "crashed"


def test_inject_configuration_corruption(client):
    _vm(client, power_state="running")
    event = _inject(client, "vm-dr-01", "configuration_corruption")
    assert event["failure_type"] == "disk_corruption"
    assert event["auto_recoverable"] is False
    assert _power(client, "vm-dr-01") == "corrupted"


def test_inject_service_outage(client):
    _vm(client, power_state="running")
    event = _inject(client, "vm-dr-01", "service_outage")
    assert event["failure_type"] == "power_outage"
    assert _power(client, "vm-dr-01") == "stopped"


def test_inject_failed_health_check_leaves_state_unchanged(client):
    _vm(client, power_state="running")
    event = _inject(client, "vm-dr-01", "failed_health_check")
    assert event["severity"] == "error"
    assert _power(client, "vm-dr-01") == "running"
    # Recorded and listable
    listed = client.get("/api/failures?vm_id=vm-dr-01").json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == event["id"]


def test_inject_interrupted_recovery(client):
    _vm(client)
    rec = client.post(
        "/api/recovery",
        json={
            "id": "rec-ip-01",
            "vm_id": "vm-dr-01",
            "vm_name": "name-vm-dr-01",
            "target_snapshot_id": "snap-x",
            "target_snapshot_name": "snap-x",
            "status": "in_progress",
        },
    )
    assert rec.status_code == 201
    event = _inject(client, "vm-dr-01", "interrupted_recovery")
    assert event["scenario"] == "interrupted_recovery"
    attempt = client.get("/api/recovery/rec-ip-01").json()
    assert attempt["status"] == "failed"
    assert attempt["completed_at"] is not None


def test_inject_interrupted_recovery_without_in_progress_returns_409(client):
    _vm(client)
    resp = client.post(
        "/api/failures", json={"vm_id": "vm-dr-01", "scenario": "interrupted_recovery"}
    )
    assert resp.status_code == 409


def test_inject_crash_on_stopped_vm_returns_409(client):
    _vm(client)  # stopped by default
    resp = client.post(
        "/api/failures", json={"vm_id": "vm-dr-01", "scenario": "application_crash"}
    )
    assert resp.status_code == 409
    assert _power(client, "vm-dr-01") == "stopped"


def test_inject_outage_on_stopped_vm_returns_409(client):
    _vm(client)
    resp = client.post(
        "/api/failures", json={"vm_id": "vm-dr-01", "scenario": "service_outage"}
    )
    assert resp.status_code == 409


def test_inject_missing_vm_returns_404(client):
    resp = client.post(
        "/api/failures", json={"vm_id": "ghost-vm", "scenario": "service_outage"}
    )
    assert resp.status_code == 404


def test_inject_invalid_scenario_returns_422(client):
    _vm(client)
    resp = client.post(
        "/api/failures", json={"vm_id": "vm-dr-01", "scenario": "meteor_strike"}
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_inject_blank_vm_id_returns_422(client):
    resp = client.post("/api/failures", json={"vm_id": "  ", "scenario": "service_outage"})
    assert resp.status_code == 422


def test_injection_only_touches_target_vm(client):
    _vm(client, vm_id="vm-victim", power_state="running")
    _vm(client, vm_id="vm-bystander", power_state="running")
    _inject(client, "vm-victim", "application_crash")
    assert _power(client, "vm-victim") == "crashed"
    assert _power(client, "vm-bystander") == "running"
    listed = client.get("/api/failures?vm_id=vm-bystander").json()
    assert listed["total"] == 0


def test_get_failure_event_and_404(client):
    _vm(client, power_state="running")
    event = _inject(client, "vm-dr-01", "service_outage")
    assert client.get(f"/api/failures/{event['id']}").status_code == 200
    assert client.get("/api/failures/ghost-event").status_code == 404


# ---------------------------------------------------------------------------
# Recovery workflow – success path
# ---------------------------------------------------------------------------

def test_execute_recovery_success(client):
    _vm(client)
    snap = _take(client, "vm-dr-01", name="good")
    # Crash the VM, then recover via the guarded workflow
    client.post("/api/vms/vm-dr-01/start")
    _inject(client, "vm-dr-01", "application_crash")
    assert _power(client, "vm-dr-01") == "crashed"

    resp = client.post(
        "/api/recovery/execute",
        json={"vm_id": "vm-dr-01", "snapshot_id": snap["id"], "confirmed": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Step 3/10: current and target states displayed
    assert body["current_state_before"] == "crashed"
    assert body["target_state"] == "stopped"
    # Step 7/8/10: health, timing, final result
    assert body["health_check"]["passed"] is True
    assert body["elapsed_seconds"] >= 0
    assert body["attempt"]["status"] == "succeeded"
    assert body["attempt"]["completed_at"] is not None
    assert body["attempt"]["restored_checksum_match"] is True
    assert body["attempt"]["failure_event_id"] is not None  # linked to crash
    # Step 6: VM actually restored
    assert body["vm"]["power_state"] == "stopped"
    assert _power(client, "vm-dr-01") == "stopped"
    # Step 9: history preserved
    assert client.get(f"/api/snapshots/{snap['id']}").status_code == 200
    assert client.get("/api/vms/vm-dr-01/snapshots").json()["total"] == 1


def test_execute_recovery_requires_confirmation(client):
    _vm(client)
    snap = _take(client, "vm-dr-01")
    resp = client.post(
        "/api/recovery/execute",
        json={"vm_id": "vm-dr-01", "snapshot_id": snap["id"], "confirmed": False},
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"
    # Nothing changed: no attempt recorded
    assert client.get("/api/recovery").json()["total"] == 0


def test_execute_recovery_failed_health_check(client):
    _vm(client)
    snap = _take(client, "vm-dr-01", name="base")
    client.post("/api/vms/vm-dr-01/start")
    resp = client.post(
        "/api/recovery/execute",
        json={
            "vm_id": "vm-dr-01",
            "snapshot_id": snap["id"],
            "confirmed": True,
            "health_check": "fail",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["health_check"]["passed"] is False
    assert body["attempt"]["status"] == "failed"
    assert body["attempt"]["restored_checksum_match"] is False
    assert body["attempt"]["completed_at"] is not None
    # Restore still applied deterministically even though health failed
    assert body["vm"]["power_state"] == "stopped"


def test_execute_recovery_auto_health_fails_on_crashed_snapshot(client):
    _vm(client, power_state="running")
    _inject(client, "vm-dr-01", "application_crash")  # now crashed
    snap = _take(client, "vm-dr-01", name="crashed-snap")
    # Repair to stopped via outage path is impossible from crashed except stop;
    # use lifecycle stop to get back, then execute against crashed snapshot
    client.post("/api/vms/vm-dr-01/stop")
    resp = client.post(
        "/api/recovery/execute",
        json={"vm_id": "vm-dr-01", "snapshot_id": snap["id"], "confirmed": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["target_state"] == "crashed"
    assert body["health_check"]["passed"] is False
    assert body["attempt"]["status"] == "failed"


def test_execute_invalid_inputs(client):
    _vm(client)
    snap = _take(client, "vm-dr-01")
    # Missing VM
    r1 = client.post(
        "/api/recovery/execute",
        json={"vm_id": "ghost-vm", "snapshot_id": snap["id"], "confirmed": True},
    )
    assert r1.status_code == 404
    # Missing snapshot
    r2 = client.post(
        "/api/recovery/execute",
        json={"vm_id": "vm-dr-01", "snapshot_id": "ghost-snap", "confirmed": True},
    )
    assert r2.status_code == 404
    # Blank ids
    r3 = client.post(
        "/api/recovery/execute",
        json={"vm_id": "  ", "snapshot_id": snap["id"], "confirmed": True},
    )
    assert r3.status_code == 422
    # Bad health_check value
    r4 = client.post(
        "/api/recovery/execute",
        json={
            "vm_id": "vm-dr-01",
            "snapshot_id": snap["id"],
            "confirmed": True,
            "health_check": "maybe",
        },
    )
    assert r4.status_code == 422


def test_execute_snapshot_ownership_mismatch(client):
    _vm(client, vm_id="vm-own")
    _vm(client, vm_id="vm-other")
    snap = _take(client, "vm-own", name="owned")
    resp = client.post(
        "/api/recovery/execute",
        json={"vm_id": "vm-other", "snapshot_id": snap["id"], "confirmed": True},
    )
    assert resp.status_code == 409
    assert client.get("/api/recovery").json()["total"] == 0


# ---------------------------------------------------------------------------
# Audit logging + history
# ---------------------------------------------------------------------------

def test_recovery_and_failure_audit_trail(client):
    _vm(client, power_state="running")
    _inject(client, "vm-dr-01", "service_outage")
    snap = _take(client, "vm-dr-01", name="pre-outage")
    client.post(
        "/api/recovery/execute",
        json={"vm_id": "vm-dr-01", "snapshot_id": snap["id"], "confirmed": True},
    )
    types = [e["type"] for e in client.get("/api/audit").json()["items"]]
    assert "failure_injected" in types
    assert "recovery_initiated" in types
    assert "recovery_succeeded" in types


def test_failed_recovery_audit_trail(client):
    _vm(client)
    snap = _take(client, "vm-dr-01")
    client.post(
        "/api/recovery/execute",
        json={
            "vm_id": "vm-dr-01",
            "snapshot_id": snap["id"],
            "confirmed": True,
            "health_check": "fail",
        },
    )
    types = [e["type"] for e in client.get("/api/audit").json()["items"]]
    assert "recovery_initiated" in types
    assert "recovery_failed" in types


# ---------------------------------------------------------------------------
# Concurrency safety
# ---------------------------------------------------------------------------

def test_concurrent_execute_is_serialized(client):
    # Use a file-backed DB for this test: the default fixture shares one
    # in-memory StaticPool connection across threads, which cannot support
    # truly concurrent sessions. A file DB gives each thread its own pooled
    # connection, matching production semantics.
    import os
    import tempfile

    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from database import Base

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name
    try:
        import models as _models  # noqa: F401 – ensure ORM registration

        file_engine = create_engine(
            f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
        )
        FileSession = sessionmaker(autocommit=False, autoflush=False, bind=file_engine)
        Base.metadata.create_all(bind=file_engine)

        def file_override():
            db = FileSession()
            try:
                yield db
            finally:
                db.close()

        original = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = file_override
        try:
            setup = TestClient(app, raise_server_exceptions=False)
            _vm(setup, vm_id="vm-dr-01", power_state="running")
            snap = _take(setup, "vm-dr-01", name="race-base")
            _inject(setup, "vm-dr-01", "service_outage")
            snap_id = snap["id"]

            results = []
            bodies = []
            errors = []

            def run_one():
                try:
                    tclient = TestClient(app, raise_server_exceptions=False)
                    r = tclient.post(
                        "/api/recovery/execute",
                        json={
                            "vm_id": "vm-dr-01",
                            "snapshot_id": snap_id,
                            "confirmed": True,
                        },
                    )
                    results.append(r.status_code)
                    bodies.append(r.text[:300])
                except Exception as exc:  # pragma: no cover – must not happen
                    errors.append(str(exc))

            threads = [threading.Thread(target=run_one) for _ in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            assert errors == [], errors
            assert results == [200, 200, 200, 200], bodies
            # All four attempts persisted consistently; final state deterministic
            check = TestClient(app, raise_server_exceptions=False)
            assert check.get("/api/recovery?vm_id=vm-dr-01").json()["total"] == 4
            assert check.get("/api/vms/vm-dr-01").json()["power_state"] == "running"
            assert check.get(f"/api/snapshots/{snap_id}").status_code == 200
        finally:
            if original is None:
                app.dependency_overrides.pop(get_db, None)
            else:
                app.dependency_overrides[get_db] = original
            file_engine.dispose()
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# DB-error handling
# ---------------------------------------------------------------------------

def test_execute_db_error_returns_json_500(client):
    _vm(client)
    snap = _take(client, "vm-dr-01")

    mock_db = MagicMock()
    mock_db.query.side_effect = SQLAlchemyError("dr boom")

    def override():
        yield mock_db

    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override
    try:
        resp = client.post(
            "/api/recovery/execute",
            json={"vm_id": "vm-dr-01", "snapshot_id": snap["id"], "confirmed": True},
        )
    finally:
        if original is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original

    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "dr boom" not in str(body)


def test_inject_db_error_returns_json_500(client):
    _vm(client, power_state="running")

    mock_db = MagicMock()
    mock_db.query.side_effect = SQLAlchemyError("inject boom")

    def override():
        yield mock_db

    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override
    try:
        resp = client.post(
            "/api/failures", json={"vm_id": "vm-dr-01", "scenario": "service_outage"}
        )
    finally:
        if original is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original

    assert resp.status_code == 500
    assert "inject boom" not in str(resp.json())
