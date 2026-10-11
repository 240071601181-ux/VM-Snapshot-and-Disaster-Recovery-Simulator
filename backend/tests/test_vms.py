"""
test_vms.py – Tests for VM records CRUD endpoints.

Covers: normal create/get/update/delete, duplicate ID (409), blank name (422),
invalid hardware (422), missing VM (404), and pagination.
"""

import pytest
from tests.conftest import SAMPLE_VM


def test_create_vm_success(client):
    resp = client.post("/api/vms", json=SAMPLE_VM)
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == "vm-test-01"
    assert data["name"] == "test-server"
    assert data["environment"] == "staging"
    assert data["hardware"]["cpu_cores"] == 4
    assert data["snapshot_count"] == 0


def test_create_vm_duplicate_id_returns_409(client):
    client.post("/api/vms", json=SAMPLE_VM)
    resp = client.post("/api/vms", json=SAMPLE_VM)
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"]


def test_create_vm_blank_name_returns_422(client):
    payload = {**SAMPLE_VM, "name": "   "}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"] == "validation_error"


def test_create_vm_invalid_cpu_returns_422(client):
    payload = {**SAMPLE_VM, "hardware": {"cpu_cores": 0, "memory_mb": 8192, "disk_size_gb": 100}}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 422


def test_create_vm_invalid_memory_returns_422(client):
    payload = {**SAMPLE_VM, "hardware": {"cpu_cores": 4, "memory_mb": 256, "disk_size_gb": 100}}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 422


def test_create_vm_invalid_disk_returns_422(client):
    payload = {**SAMPLE_VM, "hardware": {"cpu_cores": 4, "memory_mb": 8192, "disk_size_gb": 5}}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 422


def test_create_vm_invalid_environment_returns_422(client):
    payload = {**SAMPLE_VM, "environment": "cloud"}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 422


def test_get_vm_success(client):
    client.post("/api/vms", json=SAMPLE_VM)
    resp = client.get("/api/vms/vm-test-01")
    assert resp.status_code == 200
    assert resp.json()["id"] == "vm-test-01"


def test_get_vm_not_found_returns_404(client):
    resp = client.get("/api/vms/non-existent-vm")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_update_vm_success(client):
    client.post("/api/vms", json=SAMPLE_VM)
    resp = client.put("/api/vms/vm-test-01", json={"name": "renamed-server", "environment": "production"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "renamed-server"
    assert data["environment"] == "production"


def test_update_vm_blank_name_returns_422(client):
    client.post("/api/vms", json=SAMPLE_VM)
    resp = client.put("/api/vms/vm-test-01", json={"name": "  "})
    assert resp.status_code == 422


def test_update_vm_not_found_returns_404(client):
    resp = client.put("/api/vms/ghost-vm", json={"name": "new-name"})
    assert resp.status_code == 404


def test_delete_vm_success(client):
    client.post("/api/vms", json=SAMPLE_VM)
    resp = client.delete("/api/vms/vm-test-01")
    assert resp.status_code == 204
    # Verify it's gone
    resp2 = client.get("/api/vms/vm-test-01")
    assert resp2.status_code == 404


def test_delete_vm_not_found_returns_404(client):
    resp = client.delete("/api/vms/ghost-vm")
    assert resp.status_code == 404


def test_list_vms_empty(client):
    resp = client.get("/api/vms")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []
    assert data["page"] == 1
    assert data["total_pages"] == 1


def test_list_vms_pagination(client):
    # Create 3 VMs
    for i in range(3):
        vm = {**SAMPLE_VM, "id": f"vm-page-{i}", "name": f"server-{i}"}
        client.post("/api/vms", json=vm)

    resp = client.get("/api/vms?page=1&page_size=2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["total_pages"] == 2

    resp2 = client.get("/api/vms?page=2&page_size=2")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert len(data2["items"]) == 1
