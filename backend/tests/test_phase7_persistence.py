"""
test_phase7_persistence.py – Phase 7 tests for persistence, migrations,
rollback, metrics formulas, and timestamp conventions.

Covers: VM records + lifecycle state, snapshots + captured state, failure
events, recovery attempts, and audit linkage surviving an application
restart (file DB, two successive clients); legacy database migration
without data loss; transaction rollback on commit failure; dashboard
metric formulas including empty datasets; UTC ISO 8601 timestamps.
"""

import os
import tempfile
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

import models  # noqa: F401 – ensure ORM registration for create_all
from database import get_db, migrate_legacy_databases
from main import app
from tests.conftest import SAMPLE_AUDIT, SAMPLE_RECOVERY, SAMPLE_SNAPSHOT, SAMPLE_VM


def _file_client(db_path: str):
    """Build a TestClient bound to a file DB; caller must restore overrides."""
    file_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    FileSession = sessionmaker(autocommit=False, autoflush=False, bind=file_engine)
    migrate_legacy_databases(file_engine)

    def override():
        db = FileSession()
        try:
            yield db
        finally:
            db.close()

    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override
    return TestClient(app, raise_server_exceptions=False), file_engine, original


def _restore_override(original):
    if original is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = original


def _fresh_db_path():
    tf = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = tf.name
    tf.close()
    return path


# ---------------------------------------------------------------------------
# Persistence across restart
# ---------------------------------------------------------------------------

def test_vm_lifecycle_state_survives_restart():
    db_path = _fresh_db_path()
    try:
        c1, e1, o1 = _file_client(db_path)
        assert c1.post("/api/vms", json=SAMPLE_VM).status_code == 201
        assert c1.post("/api/vms/vm-test-01/start").status_code == 200
        _restore_override(o1)

        c2, e2, o2 = _file_client(db_path)
        vm = c2.get("/api/vms/vm-test-01").json()
        assert vm["power_state"] == "running"
        assert vm["hardware"] == {"cpu_cores": 4, "memory_mb": 8192, "disk_size_gb": 100}
        _restore_override(o2)
        e2.dispose()
        e1.dispose()
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


def test_snapshot_captured_state_survives_restart():
    db_path = _fresh_db_path()
    try:
        c1, e1, o1 = _file_client(db_path)
        c1.post("/api/vms", json=SAMPLE_VM)
        c1.post("/api/vms/vm-test-01/start")
        snap = c1.post("/api/vms/vm-test-01/snapshots", json={"name": "persisted"}).json()
        _restore_override(o1)

        c2, e2, o2 = _file_client(db_path)
        fetched = c2.get(f"/api/snapshots/{snap['id']}").json()
        assert fetched["power_state"] == "running"
        assert fetched["hardware"] == {"cpu_cores": 4, "memory_mb": 8192, "disk_size_gb": 100}
        diff = c2.get(f"/api/snapshots/{snap['id']}/diff").json()
        assert diff["power_state_diff"]["snapshot"] == "running"
        listed = c2.get("/api/vms/vm-test-01/snapshots").json()
        assert listed["total"] == 1
        _restore_override(o2)
        e2.dispose()
        e1.dispose()
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


def test_failure_events_survive_restart():
    db_path = _fresh_db_path()
    try:
        c1, e1, o1 = _file_client(db_path)
        c1.post("/api/vms", json={**SAMPLE_VM, "power_state": "running"})
        event = c1.post(
            "/api/failures", json={"vm_id": "vm-test-01", "scenario": "application_crash"}
        ).json()
        _restore_override(o1)

        c2, e2, o2 = _file_client(db_path)
        assert c2.get(f"/api/failures/{event['id']}").status_code == 200
        assert c2.get("/api/failures?vm_id=vm-test-01").json()["total"] == 1
        assert c2.get("/api/vms/vm-test-01").json()["power_state"] == "crashed"
        _restore_override(o2)
        e2.dispose()
        e1.dispose()
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


def test_recovery_attempts_and_audits_survive_restart():
    db_path = _fresh_db_path()
    try:
        c1, e1, o1 = _file_client(db_path)
        c1.post("/api/vms", json=SAMPLE_VM)
        snap = c1.post("/api/vms/vm-test-01/snapshots", json={"name": "s"}).json()
        res = c1.post(
            "/api/recovery/execute",
            json={"vm_id": "vm-test-01", "snapshot_id": snap["id"], "confirmed": True},
        )
        assert res.status_code == 200
        attempt_id = res.json()["attempt"]["id"]
        _restore_override(o1)

        c2, e2, o2 = _file_client(db_path)
        assert c2.get(f"/api/recovery/{attempt_id}").json()["status"] == "succeeded"
        types = [e["type"] for e in c2.get("/api/audit").json()["items"]]
        assert "recovery_initiated" in types
        assert "recovery_succeeded" in types
        dash = c2.get("/api/dashboard").json()
        assert dash["total_recovery_attempts"] == 1
        assert dash["successful_recoveries"] == 1
        assert len(dash["recent_recovery_attempts"]) == 1
        _restore_override(o2)
        e2.dispose()
        e1.dispose()
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Legacy migration without data loss
# ---------------------------------------------------------------------------

def test_legacy_snapshot_table_migrates_without_data_loss():
    db_path = _fresh_db_path()
    try:
        legacy_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        with legacy_engine.begin() as conn:
            # Pre-Phase-4 shape: no state_json / hardware_json columns.
            conn.execute(text(
                "CREATE TABLE snapshot_metadata (id VARCHAR PRIMARY KEY, vm_id VARCHAR NOT NULL, "
                "vm_name VARCHAR NOT NULL, name VARCHAR NOT NULL, description TEXT DEFAULT '', "
                "created_at VARCHAR NOT NULL, size_bytes INTEGER DEFAULT 0, is_consistent BOOLEAN DEFAULT 1, "
                "schema_version VARCHAR DEFAULT '1.0', environment VARCHAR, os VARCHAR, "
                "parent_snapshot_id VARCHAR, tree_depth INTEGER DEFAULT 0)"
            ))
            conn.execute(text(
                "INSERT INTO snapshot_metadata (id, vm_id, vm_name, name, created_at) VALUES "
                "('snap-legacy-01', 'vm-old', 'old-vm', 'legacy snap', '2020-01-01T00:00:00+00:00')"
            ))

        migrate_legacy_databases(legacy_engine)
        migrate_legacy_databases(legacy_engine)  # idempotent second run

        with legacy_engine.begin() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("snapshot_metadata")}
            assert {"state_json", "hardware_json"} <= cols
            rows = conn.execute(text("SELECT id, name FROM snapshot_metadata")).fetchall()
            assert len(rows) == 1 and rows[0][0] == "snap-legacy-01"

        # Migrated DB is fully usable through the API.
        FileSession = sessionmaker(autocommit=False, autoflush=False, bind=legacy_engine)

        def override():
            db = FileSession()
            try:
                yield db
            finally:
                db.close()

        original = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override
        try:
            tc = TestClient(app, raise_server_exceptions=False)
            assert tc.get("/api/snapshots/snap-legacy-01").status_code == 200
            tc.post("/api/vms", json=SAMPLE_VM)
            assert tc.post("/api/snapshots", json=SAMPLE_SNAPSHOT).status_code == 201
            assert tc.get("/api/snapshots").json()["total"] == 2
        finally:
            _restore_override(original)
        legacy_engine.dispose()
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Rollback behavior
# ---------------------------------------------------------------------------

def test_take_snapshot_commit_failure_rolls_back(client):
    client.post("/api/vms", json=SAMPLE_VM)
    with patch("sqlalchemy.orm.Session.commit", side_effect=SQLAlchemyError("disk gone")):
        resp = client.post("/api/vms/vm-test-01/snapshots", json={"name": "doomed"})
    assert resp.status_code == 500
    assert "disk gone" not in str(resp.json())
    # No partial snapshot row and no counter side effects leaked through.
    assert client.get("/api/snapshots").json()["total"] == 0
    vm = client.get("/api/vms/vm-test-01").json()
    assert vm["snapshot_count"] == 0
    assert vm["active_snapshot_id"] is None


def test_duplicate_create_leaves_no_partial_row(client):
    client.post("/api/vms", json=SAMPLE_VM)
    resp = client.post("/api/vms", json=SAMPLE_VM)
    assert resp.status_code == 409
    assert client.get("/api/vms").json()["total"] == 1


# ---------------------------------------------------------------------------
# Metrics formulas
# ---------------------------------------------------------------------------

def _make_attempt(client, rid, status, rto, attempted_at):
    payload = {
        **SAMPLE_RECOVERY,
        "id": rid,
        "status": status,
        "calculated_rto_seconds": rto,
        "attempted_at": attempted_at,
    }
    resp = client.post("/api/recovery", json=payload)
    assert resp.status_code == 201, resp.text


def test_dashboard_empty_dataset_has_no_division_errors(client):
    dash = client.get("/api/dashboard").json()
    assert dash["total_vms"] == 0
    assert dash["total_snapshots"] == 0
    assert dash["total_recovery_attempts"] == 0
    assert dash["successful_recoveries"] == 0
    assert dash["failed_recoveries"] == 0
    assert dash["success_rate_percent"] == 0.0
    assert dash["mean_time_to_recovery_seconds"] == 0.0
    assert dash["total_failure_events"] == 0
    assert dash["in_progress_recoveries"] == 0
    assert dash["recent_recovery_attempts"] == []


def test_dashboard_formulas_with_mixed_statuses(client):
    _make_attempt(client, "rec-s1", "succeeded", 100.0, "2026-01-01T00:00:00+00:00")
    _make_attempt(client, "rec-s2", "succeeded", 200.0, "2026-01-02T00:00:00+00:00")
    _make_attempt(client, "rec-f1", "failed", 999.0, "2026-01-03T00:00:00+00:00")
    _make_attempt(client, "rec-p1", "in_progress", 5.0, "2026-01-04T00:00:00+00:00")

    dash = client.get("/api/dashboard").json()
    assert dash["total_recovery_attempts"] == 4
    assert dash["successful_recoveries"] == 2
    assert dash["failed_recoveries"] == 1
    assert dash["in_progress_recoveries"] == 1
    # success_rate = 2/4*100; MTTR over succeeded only: (100+200)/2.
    assert dash["success_rate_percent"] == 50.0
    assert dash["mean_time_to_recovery_seconds"] == 150.0
    # Recent history: latest first.
    recent = dash["recent_recovery_attempts"]
    assert [r["id"] for r in recent] == ["rec-p1", "rec-f1", "rec-s2", "rec-s1"]


def test_dashboard_recent_history_capped_at_five(client):
    for i in range(7):
        _make_attempt(client, f"rec-h{i}", "succeeded", 10.0, f"2026-02-{i + 1:02d}T00:00:00+00:00")
    dash = client.get("/api/dashboard").json()
    assert dash["total_recovery_attempts"] == 7
    recent = dash["recent_recovery_attempts"]
    assert len(recent) == 5
    assert recent[0]["id"] == "rec-h6"
    assert recent[-1]["id"] == "rec-h2"


def test_dashboard_counts_unsuccessful_recoveries_accurately(client):
    client.post("/api/vms", json=SAMPLE_VM)
    snap = client.post("/api/vms/vm-test-01/snapshots", json={"name": "s"}).json()
    # Forced health failure -> failed; interrupted in-progress -> failed.
    client.post(
        "/api/recovery/execute",
        json={"vm_id": "vm-test-01", "snapshot_id": snap["id"], "confirmed": True, "health_check": "fail"},
    )
    client.post(
        "/api/recovery",
        json={**SAMPLE_RECOVERY, "id": "rec-ip-9", "status": "in_progress"},
    )
    client.post("/api/failures", json={"vm_id": "vm-test-01", "scenario": "interrupted_recovery"})
    dash = client.get("/api/dashboard").json()
    assert dash["failed_recoveries"] == 2
    assert dash["successful_recoveries"] == 0
    assert dash["success_rate_percent"] == 0.0
    assert dash["total_failure_events"] == 1


# ---------------------------------------------------------------------------
# Timestamp conventions
# ---------------------------------------------------------------------------

def test_all_timestamps_are_utc_iso8601(client):
    client.post("/api/vms", json=SAMPLE_VM)
    client.post("/api/vms/vm-test-01/start")
    snap = client.post("/api/vms/vm-test-01/snapshots", json={"name": "ts"}).json()
    event = client.post(
        "/api/failures", json={"vm_id": "vm-test-01", "scenario": "service_outage"}
    ).json()
    rec = client.post("/api/recovery", json=SAMPLE_RECOVERY).json()
    audit = client.post("/api/audit", json=SAMPLE_AUDIT).json()

    stamps = [
        client.get("/api/vms/vm-test-01").json()["created_at"],
        client.get("/api/vms/vm-test-01").json()["updated_at"],
        snap["created_at"],
        event["injected_at"],
        rec["attempted_at"],
        audit["timestamp"],
    ]
    assert len(stamps) == 6
    for value in stamps:
        parsed = datetime.fromisoformat(value)
        assert parsed.tzinfo is not None, value
        assert parsed.utcoffset() == UTC.utcoffset(None), value
