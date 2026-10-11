"""
test_db_errors.py – Tests that database failures are handled safely.

Uses app.dependency_overrides to inject a failing DB session, because the
test client already overrides the get_db dependency (patching
routers.<module>.get_db has no effect once dependency_overrides is set).
Verifies that the API returns HTTP 500 with a safe error message and does
NOT leak internal stack traces or SQL details.
"""

from unittest.mock import MagicMock

from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from main import app
from tests.conftest import SAMPLE_VM


def _override_with_failing_db(client, failure: Exception):
    """Inject a mock DB session whose query raises `failure`. Returns cleanup fn."""
    mock_db = MagicMock()
    mock_db.query.side_effect = failure

    def override():
        yield mock_db

    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override

    def restore():
        if original is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original

    return mock_db, restore


def test_list_vms_db_error_returns_500(client):
    _, restore = _override_with_failing_db(client, SQLAlchemyError("Simulated DB failure"))
    try:
        resp = client.get("/api/vms")
    finally:
        restore()
    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "Simulated DB failure" not in str(body)


def test_list_snapshots_db_error_returns_500(client):
    """Failing session on list call must return JSON 500, not crash."""
    _, restore = _override_with_failing_db(client, SQLAlchemyError("Simulated DB failure"))
    try:
        resp = client.get("/api/snapshots")
    finally:
        restore()
    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "Simulated DB failure" not in str(body)


def test_list_recovery_db_error_returns_500(client):
    _, restore = _override_with_failing_db(client, SQLAlchemyError("Simulated DB failure"))
    try:
        resp = client.get("/api/recovery")
    finally:
        restore()
    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "Simulated DB failure" not in str(body)


def test_list_audit_db_error_returns_500(client):
    _, restore = _override_with_failing_db(client, SQLAlchemyError("Simulated DB failure"))
    try:
        resp = client.get("/api/audit")
    finally:
        restore()
    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "Simulated DB failure" not in str(body)


def test_create_vm_commit_error_returns_500(client):
    """Simulate commit failure after add — should return 500 safely."""
    # First create succeeds so we can try an update that fails on commit
    client.post("/api/vms", json=SAMPLE_VM)

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None
    mock_db.add = MagicMock()
    mock_db.commit.side_effect = SQLAlchemyError("Disk full")
    mock_db.rollback = MagicMock()

    def override():
        yield mock_db

    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override
    try:
        payload = {**SAMPLE_VM, "id": "new-vm-999"}
        resp = client.post("/api/vms", json=payload)
    finally:
        if original is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original

    # Should be 500 with safe message
    assert resp.status_code == 500
    body = resp.json()
    # Must not leak raw SQL or Python stack traces
    assert "detail" in body
    assert "Disk full" not in str(body)
    # Rollback must have been attempted so the failed txn leaves no residue
    mock_db.rollback.assert_called_once()


def test_error_response_does_not_leak_stack_trace(client):
    """Verify error responses use the safe envelope, not Python tracebacks."""
    _, restore = _override_with_failing_db(client, SQLAlchemyError("secret internal detail"))
    try:
        resp = client.get("/api/vms")
    finally:
        restore()

    assert resp.status_code == 500
    body = resp.json()
    body_str = str(body)
    assert "Traceback" not in body_str
    assert "secret internal detail" not in body_str
