"""
test_dashboard.py – Tests for dashboard summary endpoint.
"""

from tests.conftest import SAMPLE_AUDIT, SAMPLE_RECOVERY, SAMPLE_SNAPSHOT, SAMPLE_VM


def test_dashboard_empty_db(client):
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vms"] == 0
    assert data["total_snapshots"] == 0
    assert data["total_recovery_attempts"] == 0
    assert data["successful_recoveries"] == 0
    assert data["failed_recoveries"] == 0
    assert data["success_rate_percent"] == 0.0
    assert data["mean_time_to_recovery_seconds"] == 0.0
    assert data["total_audit_events"] == 0


def test_dashboard_counts_after_inserts(client):
    # Create VM
    client.post("/api/vms", json=SAMPLE_VM)
    # Create snapshot
    client.post("/api/snapshots", json=SAMPLE_SNAPSHOT)
    # Create a succeeded recovery
    rec_success = {**SAMPLE_RECOVERY, "id": "rec-s1", "status": "succeeded", "calculated_rto_seconds": 100.0}
    client.post("/api/recovery", json=rec_success)
    # Create a failed recovery
    rec_fail = {**SAMPLE_RECOVERY, "id": "rec-f1", "status": "failed", "calculated_rto_seconds": 0.0}
    client.post("/api/recovery", json=rec_fail)
    # Create audit event
    client.post("/api/audit", json=SAMPLE_AUDIT)

    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_vms"] == 1
    assert data["total_snapshots"] == 1
    assert data["total_recovery_attempts"] == 2
    assert data["successful_recoveries"] == 1
    assert data["failed_recoveries"] == 1
    assert data["success_rate_percent"] == 50.0
    assert data["mean_time_to_recovery_seconds"] == 100.0
    assert data["total_audit_events"] == 1


def test_dashboard_success_rate_all_succeeded(client):
    for i in range(3):
        r = {**SAMPLE_RECOVERY, "id": f"rec-ok-{i}", "status": "succeeded", "calculated_rto_seconds": float(i * 30 + 30)}
        client.post("/api/recovery", json=r)

    resp = client.get("/api/dashboard")
    data = resp.json()
    assert data["success_rate_percent"] == 100.0
    assert data["mean_time_to_recovery_seconds"] == 60.0  # (30+60+90)/3 = 60
