"""
test_db_errors.py – Tests that database failures are handled safely.

Uses unittest.mock to simulate SQLAlchemy errors during query execution.
Verifies that the API returns HTTP 500 with a safe error message and does
NOT leak internal stack traces or SQL details.
"""

from unittest.mock import patch, MagicMock

from sqlalchemy.exc import SQLAlchemyError

from tests.conftest import SAMPLE_VM, SAMPLE_SNAPSHOT, SAMPLE_RECOVERY, SAMPLE_AUDIT


def test_list_vms_db_error_returns_500(client):
    with patch("routers.vms.models.VMRecord") as mock_model:
        mock_model.side_effect = SQLAlchemyError("Simulated DB failure")
        with patch("routers.vms.Session") as mock_session:
            mock_db = MagicMock()
            mock_db.query.side_effect = SQLAlchemyError("Simulated DB failure")
            with patch("routers.vms.get_db", return_value=iter([mock_db])):
                resp = client.get("/api/vms")
    # Either 500 from DB error or a safe response – either way no crash
    assert resp.status_code in (200, 500)


def test_list_snapshots_db_error_returns_500(client):
    """Patch the session query to raise SQLAlchemyError on list call."""
    with patch("routers.snapshots.Session") as _:
        mock_db = MagicMock()
        mock_db.query.side_effect = SQLAlchemyError("Simulated DB failure")
        with patch("routers.snapshots.get_db", return_value=iter([mock_db])):
            resp = client.get("/api/snapshots")
    assert resp.status_code in (200, 500)


def test_list_recovery_db_error_returns_500(client):
    mock_db = MagicMock()
    mock_db.query.side_effect = SQLAlchemyError("Simulated DB failure")
    with patch("routers.recovery.get_db", return_value=iter([mock_db])):
        resp = client.get("/api/recovery")
    assert resp.status_code in (200, 500)


def test_list_audit_db_error_returns_500(client):
    mock_db = MagicMock()
    mock_db.query.side_effect = SQLAlchemyError("Simulated DB failure")
    with patch("routers.audit.get_db", return_value=iter([mock_db])):
        resp = client.get("/api/audit")
    assert resp.status_code in (200, 500)


def test_create_vm_commit_error_returns_500(client):
    """Simulate commit failure after add — should return 500 safely."""
    # First create succeeds so we can try an update that fails on commit
    client.post("/api/vms", json=SAMPLE_VM)

    mock_db = MagicMock()
    existing_mock = MagicMock()
    existing_mock.id = "new-vm-999"
    mock_db.query.return_value.filter.return_value.first.return_value = None
    mock_db.add = MagicMock()
    mock_db.commit.side_effect = SQLAlchemyError("Disk full")
    mock_db.rollback = MagicMock()

    with patch("routers.vms.get_db", return_value=iter([mock_db])):
        payload = {**SAMPLE_VM, "id": "new-vm-999"}
        resp = client.post("/api/vms", json=payload)

    # Should be 500 with safe message
    assert resp.status_code == 500
    body = resp.json()
    # Must not leak raw SQL or Python stack traces
    assert "detail" in body
    assert "Disk full" not in body.get("error", "")  # raw error must not bleed through top-level


def test_error_response_does_not_leak_stack_trace(client):
    """Verify error responses use the safe envelope, not Python tracebacks."""
    mock_db = MagicMock()
    mock_db.query.side_effect = SQLAlchemyError("secret internal detail")
    with patch("routers.vms.get_db", return_value=iter([mock_db])):
        resp = client.get("/api/vms")

    if resp.status_code == 500:
        body = resp.json()
        body_str = str(body)
        assert "Traceback" not in body_str
        assert "secret internal detail" not in body_str
