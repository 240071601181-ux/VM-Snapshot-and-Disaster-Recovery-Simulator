"""
test_snapshots.py – Tests for snapshot metadata endpoints.

Covers: create, get, delete, vm_id filter, pagination, 404, 409, 422.
"""

from tests.conftest import SAMPLE_SNAPSHOT


def test_create_snapshot_success(client):
    resp = client.post("/api/snapshots", json=SAMPLE_SNAPSHOT)
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == "snap-test-01"
    assert data["vm_id"] == "vm-test-01"
    assert data["name"] == "Test Snapshot"
    assert data["is_consistent"] is True


def test_create_snapshot_duplicate_id_returns_409(client):
    client.post("/api/snapshots", json=SAMPLE_SNAPSHOT)
    resp = client.post("/api/snapshots", json=SAMPLE_SNAPSHOT)
    assert resp.status_code == 409


def test_create_snapshot_blank_name_returns_422(client):
    payload = {**SAMPLE_SNAPSHOT, "name": "   "}
    resp = client.post("/api/snapshots", json=payload)
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_create_snapshot_blank_vm_id_returns_422(client):
    payload = {**SAMPLE_SNAPSHOT, "vm_id": ""}
    resp = client.post("/api/snapshots", json=payload)
    assert resp.status_code == 422


def test_create_snapshot_invalid_environment_returns_422(client):
    payload = {**SAMPLE_SNAPSHOT, "environment": "hypercloud"}
    resp = client.post("/api/snapshots", json=payload)
    assert resp.status_code == 422


def test_get_snapshot_success(client):
    client.post("/api/snapshots", json=SAMPLE_SNAPSHOT)
    resp = client.get("/api/snapshots/snap-test-01")
    assert resp.status_code == 200
    assert resp.json()["id"] == "snap-test-01"


def test_get_snapshot_not_found_returns_404(client):
    resp = client.get("/api/snapshots/ghost-snap")
    assert resp.status_code == 404


def test_delete_snapshot_success(client):
    client.post("/api/snapshots", json=SAMPLE_SNAPSHOT)
    resp = client.delete("/api/snapshots/snap-test-01")
    assert resp.status_code == 204
    resp2 = client.get("/api/snapshots/snap-test-01")
    assert resp2.status_code == 404


def test_delete_snapshot_not_found_returns_404(client):
    resp = client.delete("/api/snapshots/ghost-snap")
    assert resp.status_code == 404


def test_list_snapshots_empty(client):
    resp = client.get("/api/snapshots")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_list_snapshots_filter_by_vm_id(client):
    snap_a = {**SAMPLE_SNAPSHOT, "id": "snap-a", "vm_id": "vm-alpha"}
    snap_b = {**SAMPLE_SNAPSHOT, "id": "snap-b", "vm_id": "vm-beta"}
    client.post("/api/snapshots", json=snap_a)
    client.post("/api/snapshots", json=snap_b)

    resp = client.get("/api/snapshots?vm_id=vm-alpha")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["vm_id"] == "vm-alpha"


def test_list_snapshots_pagination(client):
    for i in range(5):
        s = {**SAMPLE_SNAPSHOT, "id": f"snap-page-{i}"}
        client.post("/api/snapshots", json=s)

    resp = client.get("/api/snapshots?page=1&page_size=3")
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 3
    assert data["total_pages"] == 2

    resp2 = client.get("/api/snapshots?page=2&page_size=3")
    data2 = resp2.json()
    assert len(data2["items"]) == 2
