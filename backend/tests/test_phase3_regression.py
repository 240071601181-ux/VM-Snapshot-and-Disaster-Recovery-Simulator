"""
test_phase3_regression.py – Regression tests for defects confirmed during Phase 3.

Covers:
1. PaginatedResponse serialization shape (items/total/page/page_size/total_pages).
2. Pagination metadata correctness across resources.
3. Validation-error envelope (422 -> {"error": "validation_error", ...}).
4. Duplicate-check DB failure returns JSON 500 (duplicate lookup was previously
   outside the SQLAlchemy try-block, risking plain-text 500s).
5. Dashboard DB failure returns JSON 500 (dashboard previously had no handler).
6. Rollback behavior: a failed commit leaves no partial row behind.
"""

from unittest.mock import MagicMock

from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from main import app
from tests.conftest import SAMPLE_VM, SAMPLE_SNAPSHOT, SAMPLE_RECOVERY, SAMPLE_AUDIT


def _inject_mock_db(mock_db):
    def override():
        yield mock_db

    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override

    def restore():
        if original is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = original

    return restore


def test_paginated_shape_vms(client):
    resp = client.get("/api/vms")
    assert resp.status_code == 200
    data = resp.json()
    assert set(["items", "total", "page", "page_size", "total_pages"]) <= set(data.keys())
    assert isinstance(data["items"], list)
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["total_pages"] == 1


def test_paginated_shape_all_resources(client):
    for url in ("/api/snapshots", "/api/recovery", "/api/audit"):
        resp = client.get(url)
        assert resp.status_code == 200, url
        data = resp.json()
        assert "total" in data, url
        assert "items" in data, url
        assert "page" in data, url
        assert "page_size" in data, url
        assert "total_pages" in data, url


def test_pagination_metadata_math(client):
    for i in range(5):
        vm = {**SAMPLE_VM, "id": f"vm-reg-{i}", "name": f"reg-server-{i}"}
        assert client.post("/api/vms", json=vm).status_code == 201
    resp = client.get("/api/vms?page=1&page_size=2")
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["total_pages"] == 3
    assert data["page"] == 1
    assert data["page_size"] == 2
    resp2 = client.get("/api/vms?page=3&page_size=2")
    assert len(resp2.json()["items"]) == 1


def test_validation_envelope_vm_blank_name(client):
    payload = {**SAMPLE_VM, "name": "   "}
    resp = client.post("/api/vms", json=payload)
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"] == "validation_error"
    assert "detail" in body


def test_duplicate_check_db_failure_returns_json_500(client):
    """Duplicate-id lookup query failure must return JSON 500, not plain text."""
    mock_db = MagicMock()
    mock_db.query.side_effect = SQLAlchemyError("lookup boom")
    restore = _inject_mock_db(mock_db)
    try:
        resp = client.post("/api/vms", json=SAMPLE_VM)
    finally:
        restore()
    assert resp.status_code == 500
    body = resp.json()  # must be valid JSON, not empty/plain-text
    assert "detail" in body
    assert "lookup boom" not in str(body)


def test_dashboard_db_failure_returns_json_500(client):
    mock_db = MagicMock()
    mock_db.query.side_effect = SQLAlchemyError("dashboard boom")
    restore = _inject_mock_db(mock_db)
    try:
        resp = client.get("/api/dashboard")
    finally:
        restore()
    assert resp.status_code == 500
    body = resp.json()
    assert "detail" in body
    assert "dashboard boom" not in str(body)


def test_failed_commit_leaves_no_partial_row(client):
    """After a commit failure + rollback, the row must not be readable."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None
    mock_db.commit.side_effect = SQLAlchemyError("boom")
    mock_db.rollback = MagicMock()
    restore = _inject_mock_db(mock_db)
    try:
        resp = client.post("/api/vms", json={**SAMPLE_VM, "id": "vm-rollback-1"})
        assert resp.status_code == 500
    finally:
        restore()
    # Real DB was untouched by the mocked failure: row must not exist
    resp2 = client.get("/api/vms/vm-rollback-1")
    assert resp2.status_code == 404
    mock_db.rollback.assert_called_once()


def test_crud_roundtrip_persists(client):
    """Basic persistence within a session: create -> get -> delete -> 404."""
    assert client.post("/api/vms", json=SAMPLE_VM).status_code == 201
    assert client.post("/api/snapshots", json=SAMPLE_SNAPSHOT).status_code == 201
    assert client.post("/api/recovery", json=SAMPLE_RECOVERY).status_code == 201
    assert client.post("/api/audit", json=SAMPLE_AUDIT).status_code == 201
    assert client.get("/api/vms/vm-test-01").status_code == 200
    assert client.get("/api/snapshots/snap-test-01").status_code == 200
    assert client.get("/api/recovery/rec-test-01").status_code == 200
    assert client.delete("/api/vms/vm-test-01").status_code == 204
    assert client.get("/api/vms/vm-test-01").status_code == 404
