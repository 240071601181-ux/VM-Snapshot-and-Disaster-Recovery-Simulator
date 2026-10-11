"""
test_lifecycle.py – Phase 4 tests for simulated VM lifecycle transitions.

Covers: default stopped state, valid start/stop/restart cycles, invalid
transitions (409 with consistent envelope), missing VMs (404), invalid
requests (422), and per-VM isolation of power state.
"""

from tests.conftest import SAMPLE_VM


def _create(client, vm_id="vm-lc-01", **overrides):
    payload = {**SAMPLE_VM, "id": vm_id, "name": f"name-{vm_id}", **overrides}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_new_vm_defaults_to_stopped(client):
    data = _create(client)
    assert data["power_state"] == "stopped"


def test_create_vm_with_running_power_state(client):
    data = _create(client, power_state="running")
    assert data["power_state"] == "running"


def test_create_vm_invalid_power_state_returns_422(client):
    payload = {**SAMPLE_VM, "id": "vm-lc-bad", "power_state": "flying"}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_start_stop_restart_cycle(client):
    _create(client)
    assert client.post("/api/vms/vm-lc-01/start").json()["power_state"] == "running"
    assert client.get("/api/vms/vm-lc-01").json()["power_state"] == "running"
    assert client.post("/api/vms/vm-lc-01/restart").json()["power_state"] == "running"
    assert client.post("/api/vms/vm-lc-01/stop").json()["power_state"] == "stopped"
    assert client.get("/api/vms/vm-lc-01").json()["power_state"] == "stopped"


def test_start_running_vm_returns_409(client):
    _create(client, power_state="running")
    resp = client.post("/api/vms/vm-lc-01/start")
    assert resp.status_code == 409
    assert "detail" in resp.json()


def test_stop_stopped_vm_returns_409(client):
    _create(client)
    resp = client.post("/api/vms/vm-lc-01/stop")
    assert resp.status_code == 409
    assert "detail" in resp.json()


def test_restart_stopped_vm_returns_409(client):
    _create(client)
    resp = client.post("/api/vms/vm-lc-01/restart")
    assert resp.status_code == 409
    assert "detail" in resp.json()


def test_lifecycle_missing_vm_returns_404(client):
    for action in ("start", "stop", "restart"):
        resp = client.post(f"/api/vms/ghost-vm/{action}")
        assert resp.status_code == 404, action
        assert "not found" in resp.json()["detail"].lower()


def test_power_state_isolated_between_vms(client):
    _create(client, vm_id="vm-iso-a")
    _create(client, vm_id="vm-iso-b")
    assert client.post("/api/vms/vm-iso-a/start").status_code == 200
    assert client.get("/api/vms/vm-iso-a").json()["power_state"] == "running"
    assert client.get("/api/vms/vm-iso-b").json()["power_state"] == "stopped"


def test_failed_transition_does_not_change_state(client):
    _create(client)
    resp = client.post("/api/vms/vm-lc-01/restart")
    assert resp.status_code == 409
    assert client.get("/api/vms/vm-lc-01").json()["power_state"] == "stopped"
