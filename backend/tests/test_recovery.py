"""
test_recovery.py – Tests for recovery attempt endpoints.
"""

import pytest
from tests.conftest import SAMPLE_RECOVERY


def test_create_recovery_attempt_success(client):
    resp = client.post("/api/recovery", json=SAMPLE_RECOVERY)
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == "rec-test-01"
    assert data["status"] == "initiated"
    assert data["calculated_rto_seconds"] == 120.0


def test_create_recovery_duplicate_id_returns_409(client):
    client.post("/api/recovery", json=SAMPLE_RECOVERY)
    resp = client.post("/api/recovery", json=SAMPLE_RECOVERY)
    assert resp.status_code == 409


def test_create_recovery_invalid_status_returns_422(client):
    payload = {**SAMPLE_RECOVERY, "status": "unknown_status"}
    resp = client.post("/api/recovery", json=payload)
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_create_recovery_blank_vm_id_returns_422(client):
    payload = {**SAMPLE_RECOVERY, "vm_id": ""}
    resp = client.post("/api/recovery", json=payload)
    assert resp.status_code == 422


def test_create_recovery_negative_rto_returns_422(client):
    payload = {**SAMPLE_RECOVERY, "calculated_rto_seconds": -10}
    resp = client.post("/api/recovery", json=payload)
    assert resp.status_code == 422


def test_get_recovery_attempt_success(client):
    client.post("/api/recovery", json=SAMPLE_RECOVERY)
    resp = client.get("/api/recovery/rec-test-01")
    assert resp.status_code == 200
    assert resp.json()["target_snapshot_id"] == "snap-test-01"


def test_get_recovery_attempt_not_found_returns_404(client):
    resp = client.get("/api/recovery/ghost-rec")
    assert resp.status_code == 404


def test_list_recovery_attempts_empty(client):
    resp = client.get("/api/recovery")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_list_recovery_attempts_filter_by_vm_id(client):
    rec_a = {**SAMPLE_RECOVERY, "id": "rec-a", "vm_id": "vm-alpha", "vm_name": "alpha"}
    rec_b = {**SAMPLE_RECOVERY, "id": "rec-b", "vm_id": "vm-beta", "vm_name": "beta"}
    client.post("/api/recovery", json=rec_a)
    client.post("/api/recovery", json=rec_b)

    resp = client.get("/api/recovery?vm_id=vm-alpha")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["vm_id"] == "vm-alpha"


def test_list_recovery_attempts_pagination(client):
    for i in range(4):
        r = {**SAMPLE_RECOVERY, "id": f"rec-page-{i}"}
        client.post("/api/recovery", json=r)

    resp = client.get("/api/recovery?page=1&page_size=2")
    data = resp.json()
    assert data["total"] == 4
    assert len(data["items"]) == 2
    assert data["total_pages"] == 2
