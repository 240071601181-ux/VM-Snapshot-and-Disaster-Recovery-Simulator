"""
routers/snapshots.py – Snapshot metadata + simulated engine endpoints.
"""

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

import models
from database import get_db
from schemas import (
    SnapshotMetadataCreate,
    SnapshotMetadataOut,
    PaginatedSnapshotResponse,
    SnapshotDiffOut,
    SnapshotRestoreRequest,
    VMRecordOut,
)
from simulation import compute_diff, get_power_state, make_state_json, parse_hardware

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _capture_for_vm(vm: Optional[models.VMRecord]) -> tuple[str, str]:
    """Return (state_json, hardware_json) captured from a VM, or safe defaults."""
    if vm is None:
        return make_state_json("stopped"), "{}"
    try:
        hw = json.dumps(json.loads(vm.hardware_json)) if vm.hardware_json else "{}"
    except (json.JSONDecodeError, TypeError):
        hw = "{}"
    return make_state_json(get_power_state(vm.state_json)), hw


@router.get("", response_model=PaginatedSnapshotResponse)
def list_snapshots(
    vm_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PaginatedSnapshotResponse:
    try:
        q = db.query(models.SnapshotMetadata)
        if vm_id:
            q = q.filter(models.SnapshotMetadata.vm_id == vm_id)
        total = q.count()
        offset = (page - 1) * page_size
        rows = q.order_by(models.SnapshotMetadata.created_at.desc()).offset(offset).limit(page_size).all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    total_pages = max(1, (total + page_size - 1) // page_size)
    items = [SnapshotMetadataOut.model_validate(r) for r in rows]
    return PaginatedSnapshotResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=SnapshotMetadataOut, status_code=201)
def create_snapshot(
    payload: SnapshotMetadataCreate, db: Session = Depends(get_db)
) -> SnapshotMetadataOut:
    try:
        existing = db.query(models.SnapshotMetadata).filter(models.SnapshotMetadata.id == payload.id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if existing:
        raise HTTPException(status_code=409, detail=f"Snapshot with id '{payload.id}' already exists")

    try:
        # Best-effort capture: when the referenced VM exists, freeze its
        # current simulated state/hardware immutably into this snapshot.
        vm = db.query(models.VMRecord).filter(models.VMRecord.id == payload.vm_id).first()
        captured_state, captured_hw = _capture_for_vm(vm)
        row = models.SnapshotMetadata(
            id=payload.id,
            vm_id=payload.vm_id,
            vm_name=payload.vm_name,
            name=payload.name,
            description=payload.description,
            created_at=payload.created_at,
            size_bytes=payload.size_bytes,
            is_consistent=payload.is_consistent,
            schema_version=payload.schema_version,
            environment=payload.environment,
            os=payload.os,
            parent_snapshot_id=payload.parent_snapshot_id,
            tree_depth=payload.tree_depth,
            state_json=captured_state,
            hardware_json=captured_hw,
        )
        db.add(row)
        if vm is not None:
            vm.snapshot_count = (vm.snapshot_count or 0) + 1
            vm.active_snapshot_id = row.id
            vm.updated_at = _utcnow_iso()
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return SnapshotMetadataOut.model_validate(row)


@router.get("/{snapshot_id}", response_model=SnapshotMetadataOut)
def get_snapshot(snapshot_id: str, db: Session = Depends(get_db)) -> SnapshotMetadataOut:
    try:
        row = db.query(models.SnapshotMetadata).filter(models.SnapshotMetadata.id == snapshot_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Snapshot '{snapshot_id}' not found")
    return SnapshotMetadataOut.model_validate(row)


@router.delete("/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot_id: str, db: Session = Depends(get_db)) -> None:
    try:
        row = db.query(models.SnapshotMetadata).filter(models.SnapshotMetadata.id == snapshot_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Snapshot '{snapshot_id}' not found")

    try:
        db.delete(row)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc


# ---------------------------------------------------------------------------
# Phase 4 engine: compare + deterministic restore (simulation only)
# ---------------------------------------------------------------------------

def _load_snapshot_or_404(snapshot_id: str, db: Session) -> models.SnapshotMetadata:
    try:
        row = (
            db.query(models.SnapshotMetadata)
            .filter(models.SnapshotMetadata.id == snapshot_id)
            .first()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Snapshot '{snapshot_id}' not found")
    return row


@router.get("/{snapshot_id}/diff", response_model=SnapshotDiffOut)
def diff_snapshot(
    snapshot_id: str,
    vm_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> SnapshotDiffOut:
    """Compare a snapshot's saved state against a VM's current simulated state.

    Defaults to the snapshot's own VM. An explicit vm_id that does not own
    the snapshot is rejected with 409 (ownership validation).
    """
    snap = _load_snapshot_or_404(snapshot_id, db)
    target_vm_id = vm_id or snap.vm_id
    if target_vm_id != snap.vm_id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Snapshot '{snapshot_id}' belongs to VM '{snap.vm_id}', "
                f"not target VM '{target_vm_id}'"
            ),
        )

    try:
        vm = db.query(models.VMRecord).filter(models.VMRecord.id == target_vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not vm:
        raise HTTPException(status_code=404, detail=f"VM '{target_vm_id}' not found")

    diff = compute_diff(
        snapshot_id=snap.id,
        snapshot_vm_id=snap.vm_id,
        snap_power=get_power_state(snap.state_json),
        snap_hw=parse_hardware(snap.hardware_json),
        curr_power=get_power_state(vm.state_json),
        curr_hw=parse_hardware(vm.hardware_json),
    )
    return SnapshotDiffOut.model_validate(diff)


@router.post("/{snapshot_id}/restore", response_model=VMRecordOut)
def restore_snapshot(
    snapshot_id: str, payload: SnapshotRestoreRequest, db: Session = Depends(get_db)
) -> VMRecordOut:
    """Deterministically restore a VM's simulated state/hardware from a snapshot.

    Snapshot history is preserved (no snapshots are deleted). The snapshot
    itself is never mutated: its payload is deep-copied onto the VM.
    """
    snap = _load_snapshot_or_404(snapshot_id, db)
    if payload.vm_id != snap.vm_id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Snapshot '{snapshot_id}' belongs to VM '{snap.vm_id}', "
                f"not target VM '{payload.vm_id}'"
            ),
        )

    try:
        vm = db.query(models.VMRecord).filter(models.VMRecord.id == payload.vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not vm:
        raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found")

    try:
        # Deep-copy the frozen payload so the snapshot row stays immutable.
        restored_state = make_state_json(get_power_state(snap.state_json))
        restored_hw = json.dumps(parse_hardware(snap.hardware_json))
        vm.state_json = restored_state
        vm.hardware_json = restored_hw
        vm.active_snapshot_id = snap.id
        vm.updated_at = _utcnow_iso()
        db.commit()
        db.refresh(vm)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    try:
        hardware = json.loads(vm.hardware_json) if vm.hardware_json else {}
    except (json.JSONDecodeError, TypeError):
        hardware = {}
    return VMRecordOut(
        id=vm.id,
        name=vm.name,
        description=vm.description,
        environment=vm.environment,
        os=vm.os,
        hardware=hardware,
        power_state=get_power_state(vm.state_json),
        active_snapshot_id=vm.active_snapshot_id,
        snapshot_count=vm.snapshot_count,
        created_at=vm.created_at,
        updated_at=vm.updated_at,
    )
