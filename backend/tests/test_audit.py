"""
test_audit.py – Tests for audit event endpoints.
"""

import pytest
from tests.conftest import SAMPLE_AUDIT


def test_create_audit_event_success(client):
    resp = client.post("/api/audit", json=SAMPLE_AUDIT)
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == "aud-test-01"
    assert data["type"] == "vm_created"
    assert data["severity"] == "info"


def test_create_audit_event_duplicate_id_returns_409(client):
    client.post("/api/audit", json=SAMPLE_AUDIT)
    resp = client.post("/api/audit", json=SAMPLE_AUDIT)
    assert resp.status_code == 409


def test_create_audit_event_invalid_severity_returns_422(client):
    payload = {**SAMPLE_AUDIT, "severity": "catastrophic"}
    resp = client.post("/api/audit", json=payload)
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_create_audit_event_invalid_type_returns_422(client):
    payload = {**SAMPLE_AUDIT, "type": "alien_invasion"}
    resp = client.post("/api/audit", json=payload)
    assert resp.status_code == 422


def test_create_audit_event_blank_title_returns_422(client):
    payload = {**SAMPLE_AUDIT, "title": "  "}
    resp = client.post("/api/audit", json=payload)
    assert resp.status_code == 422


def test_create_audit_event_blank_operator_returns_422(client):
    payload = {**SAMPLE_AUDIT, "operator": ""}
    resp = client.post("/api/audit", json=payload)
    assert resp.status_code == 422


def test_list_audit_events_empty(client):
    resp = client.get("/api/audit")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_list_audit_events_filter_by_vm_id(client):
    aud_a = {**SAMPLE_AUDIT, "id": "aud-a", "vm_id": "vm-alpha"}
    aud_b = {**SAMPLE_AUDIT, "id": "aud-b", "vm_id": "vm-beta"}
    client.post("/api/audit", json=aud_a)
    client.post("/api/audit", json=aud_b)

    resp = client.get("/api/audit?vm_id=vm-alpha")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["vm_id"] == "vm-alpha"


def test_list_audit_events_filter_by_type(client):
    aud_created = {**SAMPLE_AUDIT, "id": "aud-c1", "type": "vm_created"}
    aud_deleted = {**SAMPLE_AUDIT, "id": "aud-c2", "type": "vm_deleted"}
    client.post("/api/audit", json=aud_created)
    client.post("/api/audit", json=aud_deleted)

    resp = client.get("/api/audit?type=vm_created")
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["type"] == "vm_created"


def test_list_audit_events_pagination(client):
    for i in range(6):
        a = {**SAMPLE_AUDIT, "id": f"aud-page-{i}"}
        client.post("/api/audit", json=a)

    resp = client.get("/api/audit?page=1&page_size=4")
    data = resp.json()
    assert data["total"] == 6
    assert len(data["items"]) == 4
    assert data["total_pages"] == 2
