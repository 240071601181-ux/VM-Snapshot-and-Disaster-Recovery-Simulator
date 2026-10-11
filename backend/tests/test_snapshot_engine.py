"""
test_snapshot_engine.py – Phase 4 tests for the simulated snapshot engine.

Covers: per-VM snapshot capture, listing by VM, detail retrieval, diff of
saved vs current state, deterministic restore, history preservation after
restore, snapshot immutability, ownership/existence validation, and isolation
between VMs.
"""

from tests.conftest import SAMPLE_VM


def _vm(client, vm_id="vm-se-01", **overrides):
    payload = {**SAMPLE_VM, "id": vm_id, "name": f"name-{vm_id}", **overrides}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _take(client, vm_id, name="snap-1", description="", status=201):
    resp = client.post(
        f"/api/vms/{vm_id}/snapshots",
        json={"name": name, "description": description},
    )
    assert resp.status_code == status, resp.text
    return resp.json() if status == 201 else resp


def test_take_snapshot_captures_current_state(client):
    _vm(client)
    client.post("/api/vms/vm-se-01/start")
    snap = _take(client, "vm-se-01", name="running-snap")
    assert snap["vm_id"] == "vm-se-01"
    assert snap["name"] == "running-snap"
    # VM bookkeeping updated
    vm = client.get("/api/vms/vm-se-01").json()
    assert vm["snapshot_count"] == 1
    assert vm["active_snapshot_id"] == snap["id"]
    # Saved state matches what was captured (running at take time)
    diff = client.get(f"/api/snapshots/{snap['id']}/diff").json()
    assert diff["power_state_diff"]["snapshot"] == "running"
    assert diff["power_state_diff"]["changed"] is False


def test_take_snapshot_missing_vm_returns_404(client):
    resp = client.post("/api/vms/ghost-vm/snapshots", json={"name": "x"})
    assert resp.status_code == 404


def test_take_snapshot_blank_name_returns_422(client):
    _vm(client)
    resp = client.post("/api/vms/vm-se-01/snapshots", json={"name": "   "})
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_list_vm_snapshots_scoped_to_vm(client):
    _vm(client, vm_id="vm-a")
    _vm(client, vm_id="vm-b")
    _take(client, "vm-a", name="a-1")
    _take(client, "vm-a", name="a-2")
    _take(client, "vm-b", name="b-1")
    data_a = client.get("/api/vms/vm-a/snapshots").json()
    assert data_a["total"] == 2
    assert {s["name"] for s in data_a["items"]} == {"a-1", "a-2"}
    data_b = client.get("/api/vms/vm-b/snapshots").json()
    assert data_b["total"] == 1
    assert data_b["items"][0]["name"] == "b-1"


def test_list_vm_snapshots_missing_vm_returns_404(client):
    resp = client.get("/api/vms/ghost-vm/snapshots")
    assert resp.status_code == 404


def test_diff_detects_power_and_hardware_changes(client):
    _vm(client)
    snap = _take(client, "vm-se-01", name="base")
    # No changes yet
    diff0 = client.get(f"/api/snapshots/{snap['id']}/diff").json()
    assert diff0["has_any_differences"] is False
    # Change power + hardware
    client.post("/api/vms/vm-se-01/start")
    client.put(
        "/api/vms/vm-se-01",
        json={"hardware": {"cpu_cores": 8, "memory_mb": 8192, "disk_size_gb": 100}},
    )
    diff = client.get(f"/api/snapshots/{snap['id']}/diff").json()
    assert diff["has_any_differences"] is True
    assert diff["power_state_diff"] == {
        "snapshot": "stopped",
        "current": "running",
        "changed": True,
    }
    assert diff["hardware_diff"]["cpu_cores"] == {
        "snapshot": 4,
        "current": 8,
        "changed": True,
    }
    assert diff["hardware_diff"]["memory_mb"]["changed"] is False
    assert diff["hardware_diff"]["has_changes"] is True


def test_diff_missing_snapshot_returns_404(client):
    assert client.get("/api/snapshots/ghost-snap/diff").status_code == 404


def test_diff_ownership_mismatch_returns_409(client):
    _vm(client, vm_id="vm-owner")
    _vm(client, vm_id="vm-other")
    snap = _take(client, "vm-owner", name="owned")
    resp = client.get(f"/api/snapshots/{snap['id']}/diff?vm_id=vm-other")
    assert resp.status_code == 409
    assert "detail" in resp.json()


def test_restore_is_deterministic_and_preserves_history(client):
    _vm(client)
    snap = _take(client, "vm-se-01", name="base")
    snap_id = snap["id"]
    # Mutate VM away from captured state
    client.post("/api/vms/vm-se-01/start")
    client.put(
        "/api/vms/vm-se-01",
        json={"hardware": {"cpu_cores": 8, "memory_mb": 16384, "disk_size_gb": 200}},
    )
    # Restore twice – both must converge to the identical captured state
    first = client.post(
        f"/api/snapshots/{snap_id}/restore", json={"vm_id": "vm-se-01"}
    )
    assert first.status_code == 200, first.text
    second = client.post(
        f"/api/snapshots/{snap_id}/restore", json={"vm_id": "vm-se-01"}
    )
    assert second.status_code == 200, second.text
    for body in (first.json(), second.json()):
        assert body["power_state"] == "stopped"
        assert body["hardware"] == {
            "cpu_cores": 4,
            "memory_mb": 8192,
            "disk_size_gb": 100,
        }
        assert body["active_snapshot_id"] == snap_id
    assert first.json()["hardware"] == second.json()["hardware"]
    # History preserved: snapshot still exists and VM still lists it
    assert client.get(f"/api/snapshots/{snap_id}").status_code == 200
    assert client.get("/api/vms/vm-se-01/snapshots").json()["total"] == 1
    # After restore there is no drift
    diff = client.get(f"/api/snapshots/{snap_id}/diff").json()
    assert diff["has_any_differences"] is False


def test_snapshot_immutable_after_vm_changes(client):
    _vm(client)
    snap = _take(client, "vm-se-01", name="frozen")
    snap_id = snap["id"]
    before = client.get(f"/api/snapshots/{snap_id}").json()
    # Mutate + restore the VM several times; snapshot row must never change
    client.post("/api/vms/vm-se-01/start")
    client.put(
        "/api/vms/vm-se-01",
        json={"hardware": {"cpu_cores": 16, "memory_mb": 32768, "disk_size_gb": 500}},
    )
    client.post(f"/api/snapshots/{snap_id}/restore", json={"vm_id": "vm-se-01"})
    client.post("/api/vms/vm-se-01/start")
    after = client.get(f"/api/snapshots/{snap_id}").json()
    assert after == before


def test_restore_ownership_mismatch_returns_409(client):
    _vm(client, vm_id="vm-own")
    _vm(client, vm_id="vm-intruder")
    snap = _take(client, "vm-own", name="owned")
    resp = client.post(
        f"/api/snapshots/{snap['id']}/restore", json={"vm_id": "vm-intruder"}
    )
    assert resp.status_code == 409
    # Intruder VM untouched
    assert client.get("/api/vms/vm-intruder").json()["power_state"] == "stopped"


def test_restore_missing_resources_return_404(client):
    _vm(client)
    resp = client.post("/api/snapshots/ghost-snap/restore", json={"vm_id": "vm-se-01"})
    assert resp.status_code == 404
    snap = _take(client, "vm-se-01", name="orphan-target")
    # Snapshot points at vm-se-01; requesting restore for a deleted VM id
    # that matches nothing is an ownership conflict, so delete-then-restore:
    client.delete("/api/vms/vm-se-01")
    resp2 = client.post(
        f"/api/snapshots/{snap['id']}/restore", json={"vm_id": "vm-se-01"}
    )
    assert resp2.status_code == 404


def test_restore_blank_vm_id_returns_422(client):
    _vm(client)
    snap = _take(client, "vm-se-01", name="s")
    resp = client.post(f"/api/snapshots/{snap['id']}/restore", json={"vm_id": "  "})
    assert resp.status_code == 422


def test_snapshot_isolation_between_vms(client):
    _vm(client, vm_id="vm-x")
    _vm(client, vm_id="vm-y")
    snap_x = _take(client, "vm-x", name="x-snap")
    # Restoring VM X's snapshot onto VM Y is rejected; Y keeps its own state
    client.post("/api/vms/vm-y/start")
    resp = client.post(
        f"/api/snapshots/{snap_x['id']}/restore", json={"vm_id": "vm-y"}
    )
    assert resp.status_code == 409
    assert client.get("/api/vms/vm-y").json()["power_state"] == "running"
    assert client.get("/api/vms/vm-x").json()["power_state"] == "stopped"
