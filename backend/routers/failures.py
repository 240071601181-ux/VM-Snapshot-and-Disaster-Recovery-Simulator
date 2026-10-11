"""
routers/failures.py – Controlled failure injection (Phase 5, simulation only).

Every scenario modifies ONLY the selected VM's application state row.
No host commands are executed and no real system files are touched.
Each injection records a FailureEvent plus an audit event atomically.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import models
from database import get_db
from schemas import (
    FailureEventOut,
    FailureInjectRequest,
    PaginatedFailureResponse,
)
from simulation import (
    FAILURE_SCENARIOS,
    get_power_state,
    get_vm_lock,
    make_state_json,
)

router = APIRouter(prefix="/api/failures", tags=["failures"])


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def _audit(
    db: Session,
    *,
    type: str,
    title: str,
    details: str,
    severity: str,
    vm_id: str | None = None,
    vm_name: str | None = None,
    now: str,
) -> None:
    db.add(
        models.AuditEvent(
            id=f"aud-{uuid.uuid4().hex[:12]}",
            timestamp=now,
            type=type,
            vm_id=vm_id,
            vm_name=vm_name,
            title=title,
            details=details,
            operator="dr-simulator",
            severity=severity,
        )
    )


@router.get("", response_model=PaginatedFailureResponse)
def list_failure_events(
    vm_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PaginatedFailureResponse:
    try:
        q = db.query(models.FailureEvent)
        if vm_id:
            q = q.filter(models.FailureEvent.vm_id == vm_id)
        total = q.count()
        offset = (page - 1) * page_size
        rows = (
            q.order_by(models.FailureEvent.injected_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    total_pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedFailureResponse(
        items=[FailureEventOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{event_id}", response_model=FailureEventOut)
def get_failure_event(event_id: str, db: Session = Depends(get_db)) -> FailureEventOut:
    try:
        row = db.query(models.FailureEvent).filter(models.FailureEvent.id == event_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Failure event '{event_id}' not found")
    return FailureEventOut.model_validate(row)


@router.post("", response_model=FailureEventOut, status_code=201)
def inject_failure(payload: FailureInjectRequest, db: Session = Depends(get_db)) -> FailureEventOut:
    """Inject a controlled simulated failure into one VM only."""
    spec = FAILURE_SCENARIOS[payload.scenario]
    now = _utcnow_iso()

    # Serialize with concurrent recovery ops on the same VM.
    with get_vm_lock(payload.vm_id):
        try:
            vm = db.query(models.VMRecord).filter(models.VMRecord.id == payload.vm_id).first()
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=500, detail="Database error occurred") from exc
        if not vm:
            raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found")

        current = get_power_state(vm.state_json)
        required = spec["requires_states"]
        if required is not None and current not in required:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot inject '{payload.scenario}' into VM '{vm.name}' "
                    f"while it is '{current}'."
                ),
            )

        interrupted_notes: str | None = None
        if payload.scenario == "interrupted_recovery":
            try:
                running = (
                    db.query(models.RecoveryAttempt)
                    .filter(
                        models.RecoveryAttempt.vm_id == vm.id,
                        models.RecoveryAttempt.status == "in_progress",
                    )
                    .order_by(models.RecoveryAttempt.attempted_at.desc())
                    .first()
                )
            except SQLAlchemyError as exc:
                raise HTTPException(status_code=500, detail="Database error occurred") from exc
            if not running:
                raise HTTPException(
                    status_code=409,
                    detail=f"VM '{vm.name}' has no in-progress recovery to interrupt.",
                )
            running.status = "failed"
            running.completed_at = now
            running.notes = "Simulated interruption: recovery did not complete."
            interrupted_notes = running.id

        try:
            if spec["result_state"] is not None:
                vm.state_json = make_state_json(spec["result_state"])
                vm.updated_at = now
            description = payload.description.strip() or spec["impact"]
            event = models.FailureEvent(
                id=f"fail-{uuid.uuid4().hex[:12]}",
                vm_id=vm.id,
                vm_name=vm.name,
                scenario=payload.scenario,
                failure_type=spec["failure_type"],
                severity=spec["severity"],
                description=description,
                injected_at=now,
                impact_summary=spec["impact"]
                + (f" Interrupted attempt '{interrupted_notes}'." if interrupted_notes else ""),
                auto_recoverable=spec["auto_recoverable"],
            )
            db.add(event)
            _audit(
                db,
                type="failure_injected",
                title=f"Failure injected: {payload.scenario} on {vm.name}",
                details=description,
                severity="error" if spec["severity"] == "error" else spec["severity"],
                vm_id=vm.id,
                vm_name=vm.name,
                now=now,
            )
            db.commit()
            db.refresh(event)
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return FailureEventOut.model_validate(event)
