"""
routers/recovery.py – Recovery attempt endpoints + guarded DR workflow (Phase 5).
"""

import json
import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import models
from database import get_db
from schemas import (
    HealthCheckOut,
    PaginatedRecoveryResponse,
    RecoveryAttemptCreate,
    RecoveryAttemptOut,
    RecoveryExecuteOut,
    RecoveryExecuteRequest,
    VMRecordOut,
)
from simulation import (
    apply_snapshot_to_vm,
    check_simulated_health,
    get_power_state,
    get_vm_lock,
)

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def _rpo_seconds(snapshot_created_at: str | None, start_iso: str) -> float:
    try:
        start = datetime.fromisoformat(start_iso)
        created = datetime.fromisoformat(snapshot_created_at or start_iso)
        return max(0.0, (start - created).total_seconds())
    except (ValueError, TypeError):
        return 0.0


def _vm_to_out(vm: models.VMRecord) -> VMRecordOut:
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


@router.get("", response_model=PaginatedRecoveryResponse)
def list_recovery_attempts(
    vm_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PaginatedRecoveryResponse:
    try:
        q = db.query(models.RecoveryAttempt)
        if vm_id:
            q = q.filter(models.RecoveryAttempt.vm_id == vm_id)
        total = q.count()
        offset = (page - 1) * page_size
        rows = (
            q.order_by(models.RecoveryAttempt.attempted_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    total_pages = max(1, (total + page_size - 1) // page_size)
    items = [RecoveryAttemptOut.model_validate(r) for r in rows]
    return PaginatedRecoveryResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=RecoveryAttemptOut, status_code=201)
def create_recovery_attempt(
    payload: RecoveryAttemptCreate, db: Session = Depends(get_db)
) -> RecoveryAttemptOut:
    try:
        existing = db.query(models.RecoveryAttempt).filter(models.RecoveryAttempt.id == payload.id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if existing:
        raise HTTPException(status_code=409, detail=f"Recovery attempt '{payload.id}' already exists")

    try:
        row = models.RecoveryAttempt(
            id=payload.id,
            vm_id=payload.vm_id,
            vm_name=payload.vm_name,
            failure_event_id=payload.failure_event_id,
            target_snapshot_id=payload.target_snapshot_id,
            target_snapshot_name=payload.target_snapshot_name,
            attempted_at=payload.attempted_at,
            completed_at=payload.completed_at,
            status=payload.status,
            calculated_rto_seconds=payload.calculated_rto_seconds,
            calculated_rpo_seconds=payload.calculated_rpo_seconds,
            restored_checksum_match=payload.restored_checksum_match,
            notes=payload.notes,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return RecoveryAttemptOut.model_validate(row)


@router.get("/{attempt_id}", response_model=RecoveryAttemptOut)
def get_recovery_attempt(attempt_id: str, db: Session = Depends(get_db)) -> RecoveryAttemptOut:
    try:
        row = db.query(models.RecoveryAttempt).filter(models.RecoveryAttempt.id == attempt_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Recovery attempt '{attempt_id}' not found")
    return RecoveryAttemptOut.model_validate(row)


# ---------------------------------------------------------------------------
# Phase 5 – guarded disaster-recovery execution (simulation only)
# ---------------------------------------------------------------------------

@router.post("/execute", response_model=RecoveryExecuteOut)
def execute_recovery(
    payload: RecoveryExecuteRequest, db: Session = Depends(get_db)
) -> RecoveryExecuteOut:
    """Execute the 10-step DR workflow: select VM + snapshot, confirm,
    restore deterministically, health-check, record attempt + audits.

    Serialized per VM against concurrent requests. Snapshots and audit
    history are preserved. All writes commit atomically.
    """
    start_iso = _utcnow_iso()
    t0 = time.monotonic()

    # Serialize with concurrent failure/recovery ops on the same VM.
    with get_vm_lock(payload.vm_id):
        try:
            vm = db.query(models.VMRecord).filter(models.VMRecord.id == payload.vm_id).first()
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=500, detail="Database error occurred") from exc
        if not vm:
            raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found")

        try:
            snap = (
                db.query(models.SnapshotMetadata)
                .filter(models.SnapshotMetadata.id == payload.snapshot_id)
                .first()
            )
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=500, detail="Database error occurred") from exc
        if not snap:
            raise HTTPException(
                status_code=404, detail=f"Snapshot '{payload.snapshot_id}' not found"
            )
        if snap.vm_id != vm.id:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Snapshot '{snap.id}' belongs to VM '{snap.vm_id}', "
                    f"not target VM '{vm.id}'"
                ),
            )

        current_before = get_power_state(vm.state_json)
        target_state = get_power_state(snap.state_json)

        try:
            latest_failure = (
                db.query(models.FailureEvent)
                .filter(models.FailureEvent.vm_id == vm.id)
                .order_by(models.FailureEvent.injected_at.desc())
                .first()
            )
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=500, detail="Database error occurred") from exc

        # Deterministic restore (bit-identical to snapshot restore path).
        restored_state_json, restored_hw_json = apply_snapshot_to_vm(
            snap.state_json, snap.hardware_json
        )
        vm.state_json = restored_state_json
        vm.hardware_json = restored_hw_json
        vm.active_snapshot_id = snap.id
        vm.updated_at = start_iso

        if payload.health_check == "auto":
            healthy, health_detail = check_simulated_health(target_state)
        elif payload.health_check == "pass":
            healthy, health_detail = True, "Simulated health check forced to pass."
        else:
            healthy, health_detail = False, "Simulated health check forced to fail."

        elapsed = time.monotonic() - t0
        end_iso = _utcnow_iso()
        status = "succeeded" if healthy else "failed"
        try:
            attempt = models.RecoveryAttempt(
                id=f"rec-{uuid.uuid4().hex[:12]}",
                vm_id=vm.id,
                vm_name=vm.name,
                failure_event_id=latest_failure.id if latest_failure else None,
                target_snapshot_id=snap.id,
                target_snapshot_name=snap.name,
                attempted_at=start_iso,
                completed_at=end_iso,
                status=status,
                calculated_rto_seconds=elapsed,
                calculated_rpo_seconds=_rpo_seconds(snap.created_at, start_iso),
                restored_checksum_match=healthy,
                notes=payload.notes
                or (
                    f"DR execute {status}: restored '{snap.name}' "
                    f"({current_before} -> {target_state}); {health_detail}"
                ),
            )
            db.add(attempt)
            db.add(
                models.AuditEvent(
                    id=f"aud-{uuid.uuid4().hex[:12]}",
                    timestamp=start_iso,
                    type="recovery_initiated",
                    vm_id=vm.id,
                    vm_name=vm.name,
                    title=f"Recovery initiated: {vm.name} -> {snap.name}",
                    details=f"Operator-confirmed restore from '{current_before}' to '{target_state}'.",
                    operator="dr-simulator",
                    severity="info",
                )
            )
            db.add(
                models.AuditEvent(
                    id=f"aud-{uuid.uuid4().hex[:12]}",
                    timestamp=end_iso,
                    type=f"recovery_{status}",
                    vm_id=vm.id,
                    vm_name=vm.name,
                    title=f"Recovery {status}: {vm.name}",
                    details=f"{health_detail} Elapsed {elapsed:.3f}s.",
                    operator="dr-simulator",
                    severity="success" if healthy else "error",
                )
            )
            db.commit()
            db.refresh(attempt)
            db.refresh(vm)
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return RecoveryExecuteOut(
        attempt=RecoveryAttemptOut.model_validate(attempt),
        vm=_vm_to_out(vm),
        current_state_before=current_before,
        target_state=target_state,
        health_check=HealthCheckOut(passed=healthy, detail=health_detail),
        elapsed_seconds=elapsed,
    )
