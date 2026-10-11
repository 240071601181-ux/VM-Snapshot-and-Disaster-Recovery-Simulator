"""
demo_walkthrough.py – End-to-end demonstration of the simulator (Phase 8).

Drives the real FastAPI app (TestClient + temp file SQLite DB) through the
11-step demonstration from the project README. Every step asserts the
expected API response; any mismatch raises and exits non-zero.

Usage:
    python demo_walkthrough.py
"""

import os
import tempfile

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models  # noqa: F401 – ensure ORM registration
from database import get_db, migrate_legacy_databases
from main import app

PASS = "ok"


def check(label, condition, detail=""):
    status = PASS if condition else "FAIL"
    print(f"[{status}] {label}" + (f" – {detail}" if detail else ""), flush=True)
    if not condition:
        raise AssertionError(f"demonstration step failed: {label} ({detail})")


def build_client(db_path):
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Sess = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    migrate_legacy_databases(engine)

    def override():
        db = Sess()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    return TestClient(app, raise_server_exceptions=False), engine


def main():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    db_path = tmp.name
    tmp.close()
    try:
        client, engine = build_client(db_path)

        # 1. Create a simulated VM.
        vm_payload = {
            "id": "vm-demo-01",
            "name": "demo-web-01",
            "description": "E2E demonstration VM",
            "environment": "staging",
            "os": "Ubuntu 24.04 LTS",
            "hardware": {"cpu_cores": 4, "memory_mb": 8192, "disk_size_gb": 100},
        }
        r = client.post("/api/vms", json=vm_payload)
        check("1. create VM", r.status_code == 201, f"status={r.status_code}")
        check("1. VM starts stopped", r.json()["power_state"] == "stopped")

        # 2. Start it.
        r = client.post("/api/vms/vm-demo-01/start")
        check("2. start VM", r.status_code == 200 and r.json()["power_state"] == "running")

        # 3. Create snapshot A (captures running + 4 vCPU).
        snap_a = client.post(
            "/api/vms/vm-demo-01/snapshots", json={"name": "snap-A", "description": "baseline"}
        ).json()
        check("3. snapshot A captured running", snap_a["power_state"] == "running")
        check("3. snapshot A hardware", snap_a["hardware"].get("cpu_cores") == 4)

        # 4. Modify its configuration.
        r = client.put(
            "/api/vms/vm-demo-01",
            json={"hardware": {"cpu_cores": 8, "memory_mb": 16384, "disk_size_gb": 200}},
        )
        check("4. config modified", r.json()["hardware"]["cpu_cores"] == 8)

        # 5. Create snapshot B (captures modified config).
        snap_b = client.post(
            "/api/vms/vm-demo-01/snapshots", json={"name": "snap-B"}
        ).json()
        check("5. snapshot B captured 8 vCPU", snap_b["hardware"].get("cpu_cores") == 8)

        # 6. Simulate a failure.
        event = client.post(
            "/api/failures", json={"vm_id": "vm-demo-01", "scenario": "application_crash"}
        ).json()
        check("6. failure injected", event["scenario"] == "application_crash")
        check(
            "6. VM is crashed",
            client.get("/api/vms/vm-demo-01").json()["power_state"] == "crashed",
        )

        # 7. Restore snapshot A via the guarded DR workflow.
        res = client.post(
            "/api/recovery/execute",
            json={"vm_id": "vm-demo-01", "snapshot_id": snap_a["id"], "confirmed": True},
        )
        check("7. execute restore", res.status_code == 200, f"status={res.status_code}")
        body = res.json()
        check("7. attempt succeeded", body["attempt"]["status"] == "succeeded")
        check(
            "7. before/target reported",
            body["current_state_before"] == "crashed" and body["target_state"] == "running",
            f"{body['current_state_before']}->{body['target_state']}",
        )

        # 8. Verify the restored state.
        vm = client.get("/api/vms/vm-demo-01").json()
        check("8. power restored to running", vm["power_state"] == "running")
        check("8. hardware restored to 4 vCPU", vm["hardware"]["cpu_cores"] == 8 - 4)
        diff = client.get(f"/api/snapshots/{snap_a['id']}/diff").json()
        check("8. no drift vs snapshot A", diff["has_any_differences"] is False)

        # 9. Snapshot history remains intact.
        listed = client.get("/api/vms/vm-demo-01/snapshots").json()
        check("9. both snapshots listed", listed["total"] == 2, f"total={listed['total']}")
        names = {s["name"] for s in listed["items"]}
        check("9. A and B preserved", names == {"snap-A", "snap-B"}, f"{names}")
        snap_b_after = client.get(f"/api/snapshots/{snap_b['id']}").json()
        check("9. snapshot B immutable", snap_b_after["hardware"].get("cpu_cores") == 8)

        # 10. Audit records and metrics.
        types = [e["type"] for e in client.get("/api/audit").json()["items"]]
        for expected in ("failure_injected", "recovery_initiated", "recovery_succeeded"):
            check(f"10. audit has {expected}", expected in types)
        dash = client.get("/api/dashboard").json()
        check("10. metrics totals", dash["total_vms"] == 1 and dash["total_snapshots"] == 2)
        check(
            "10. recovery counted",
            dash["successful_recoveries"] == 1 and dash["success_rate_percent"] == 100.0,
        )
        check("10. failure counted", dash["total_failure_events"] == 1)

        # 11. Restart the application (new client, same DB file) and verify.
        app.dependency_overrides.clear()
        client2, engine2 = build_client(db_path)
        vm2 = client2.get("/api/vms/vm-demo-01").json()
        check("11. VM persists after restart", vm2["power_state"] == "running")
        check(
            "11. snapshots persist after restart",
            client2.get("/api/vms/vm-demo-01/snapshots").json()["total"] == 2,
        )
        check(
            "11. attempts persist after restart",
            client2.get("/api/recovery").json()["total"] == 1,
        )
        app.dependency_overrides.clear()
        engine2.dispose()
        engine.dispose()

        print("\nDemonstration complete: all 11 steps verified.", flush=True)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
