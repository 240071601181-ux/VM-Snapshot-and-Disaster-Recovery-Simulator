"""
routers/vms.py – CRUD + simulated lifecycle endpoints for VM records metadata.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

import models
from database import get_db
from schemas import (
    VMRecordCreate,
    VMRecordOut,
    VMRecordUpdate,
    PaginatedVMResponse,
    PaginatedSnapshotResponse,
    SnapshotMetadataOut,
    SnapshotTakeRequest,
)
from simulation import (
    InvalidTransitionError,
    get_power_state,
    make_state_json,
    validate_transition,
)

router = APIRouter(prefix="/api/vms", tags=["vms"])


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_out(row: models.VMRecord) -> VMRecordOut:
    try:
        hardware = json.loads(row.hardware_json) if row.hardware_json else {}
    except (json.JSONDecodeError, TypeError):
        hardware = {}
    return VMRecordOut(
        id=row.id,
        name=row.name,
        description=row.description,
        environment=row.environment,
        os=row.os,
        hardware=hardware,
        power_state=get_power_state(row.state_json),
        active_snapshot_id=row.active_snapshot_id,
        snapshot_count=row.snapshot_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=PaginatedVMResponse)
def list_vms(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PaginatedVMResponse:
    try:
        total = db.query(models.VMRecord).count()
        offset = (page - 1) * page_size
        rows = (
            db.query(models.VMRecord)
            .order_by(models.VMRecord.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedVMResponse(
        items=[_row_to_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=VMRecordOut, status_code=201)
def create_vm(payload: VMRecordCreate, db: Session = Depends(get_db)) -> VMRecordOut:
    try:
        existing = db.query(models.VMRecord).filter(models.VMRecord.id == payload.id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if existing:
        raise HTTPException(status_code=409, detail=f"VM with id '{payload.id}' already exists")

    try:
        row = models.VMRecord(
            id=payload.id,
            name=payload.name,
            description=payload.description,
            environment=payload.environment,
            os=payload.os,
            hardware_json=json.dumps(payload.hardware.model_dump()),
            state_json=make_state_json(payload.power_state),
            active_snapshot_id=payload.active_snapshot_id,
            snapshot_count=payload.snapshot_count,
            created_at=payload.created_at,
            updated_at=payload.updated_at,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return _row_to_out(row)


@router.get("/{vm_id}", response_model=VMRecordOut)
def get_vm(vm_id: str, db: Session = Depends(get_db)) -> VMRecordOut:
    try:
        row = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")
    return _row_to_out(row)


@router.put("/{vm_id}", response_model=VMRecordOut)
def update_vm(
    vm_id: str, payload: VMRecordUpdate, db: Session = Depends(get_db)
) -> VMRecordOut:
    try:
        row = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")

    try:
        if payload.name is not None:
            row.name = payload.name
        if payload.description is not None:
            row.description = payload.description
        if payload.environment is not None:
            row.environment = payload.environment
        if payload.os is not None:
            row.os = payload.os
        if payload.hardware is not None:
            row.hardware_json = json.dumps(payload.hardware.model_dump())
        if payload.active_snapshot_id is not None:
            row.active_snapshot_id = payload.active_snapshot_id
        if payload.snapshot_count is not None:
            row.snapshot_count = payload.snapshot_count
        row.updated_at = payload.updated_at
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return _row_to_out(row)


@router.delete("/{vm_id}", status_code=204)
def delete_vm(vm_id: str, db: Session = Depends(get_db)) -> None:
    try:
        row = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")

    try:
        db.delete(row)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc


# ---------------------------------------------------------------------------
# Simulated lifecycle transitions (Phase 4 – simulation only, no hypervisor)
# ---------------------------------------------------------------------------

def _apply_lifecycle_action(vm_id: str, action: str, db: Session) -> VMRecordOut:
    try:
        row = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")

    current = get_power_state(row.state_json)
    try:
        nxt = validate_transition(current, action, row.name, row.id)
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    try:
        row.state_json = make_state_json(nxt)
        row.updated_at = _utcnow_iso()
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    return _row_to_out(row)


@router.post("/{vm_id}/start", response_model=VMRecordOut)
def start_vm(vm_id: str, db: Session = Depends(get_db)) -> VMRecordOut:
    """Simulate powering on a stopped VM. 409 on illegal transition."""
    return _apply_lifecycle_action(vm_id, "start", db)


@router.post("/{vm_id}/stop", response_model=VMRecordOut)
def stop_vm(vm_id: str, db: Session = Depends(get_db)) -> VMRecordOut:
    """Simulate powering off a running/paused/crashed/corrupted VM."""
    return _apply_lifecycle_action(vm_id, "stop", db)


@router.post("/{vm_id}/restart", response_model=VMRecordOut)
def restart_vm(vm_id: str, db: Session = Depends(get_db)) -> VMRecordOut:
    """Simulate a reboot cycle for a running VM. 409 otherwise."""
    return _apply_lifecycle_action(vm_id, "restart", db)


# ---------------------------------------------------------------------------
# Per-VM snapshot endpoints (Phase 4 – capture current simulated state)
# ---------------------------------------------------------------------------

@router.get("/{vm_id}/snapshots", response_model=PaginatedSnapshotResponse)
def list_vm_snapshots(
    vm_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PaginatedSnapshotResponse:
    """List snapshots belonging to a VM. 404 when the VM does not exist."""
    try:
        vm = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not vm:
        raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")

    try:
        q = db.query(models.SnapshotMetadata).filter(models.SnapshotMetadata.vm_id == vm_id)
        total = q.count()
        offset = (page - 1) * page_size
        rows = (
            q.order_by(models.SnapshotMetadata.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedSnapshotResponse(
        items=[SnapshotMetadataOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/{vm_id}/snapshots", response_model=SnapshotMetadataOut, status_code=201)
def take_vm_snapshot(
    vm_id: str, payload: SnapshotTakeRequest, db: Session = Depends(get_db)
) -> SnapshotMetadataOut:
    """Capture an immutable snapshot of the VM's current simulated state."""
    try:
        vm = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not vm:
        raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")

    import uuid as _uuid

    now = _utcnow_iso()
    try:
        # Deep-copy current state/hardware so later VM mutations cannot
        # alter this snapshot (immutability guaranteed at the DB level).
        captured_state = make_state_json(get_power_state(vm.state_json))
        captured_hw = vm.hardware_json or "{}"
        try:
            captured_hw = json.dumps(json.loads(captured_hw))
        except (json.JSONDecodeError, TypeError):
            captured_hw = "{}"

        row = models.SnapshotMetadata(
            id=f"snap-{_uuid.uuid4().hex[:12]}",
            vm_id=vm.id,
            vm_name=vm.name,
            name=payload.name,
            description=payload.description,
            created_at=now,
            size_bytes=0,
            is_consistent=payload.is_consistent,
            schema_version="1.0",
            environment=vm.environment,
            os=vm.os,
            parent_snapshot_id=vm.active_snapshot_id,
            tree_depth=0,
            state_json=captured_state,
            hardware_json=captured_hw,
        )
        db.add(row)
        vm.snapshot_count = (vm.snapshot_count or 0) + 1
        vm.active_snapshot_id = row.id
        vm.updated_at = now
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return SnapshotMetadataOut.model_validate(row)
