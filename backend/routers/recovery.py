"""
routers/recovery.py – Recovery attempt endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

import models
from database import get_db
from schemas import (
    RecoveryAttemptCreate,
    RecoveryAttemptOut,
    PaginatedRecoveryResponse,
)

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


@router.get("", response_model=PaginatedRecoveryResponse)
def list_recovery_attempts(
    vm_id: Optional[str] = Query(default=None),
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
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

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
    existing = db.query(models.RecoveryAttempt).filter(models.RecoveryAttempt.id == payload.id).first()
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
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    return RecoveryAttemptOut.model_validate(row)


@router.get("/{attempt_id}", response_model=RecoveryAttemptOut)
def get_recovery_attempt(attempt_id: str, db: Session = Depends(get_db)) -> RecoveryAttemptOut:
    try:
        row = db.query(models.RecoveryAttempt).filter(models.RecoveryAttempt.id == attempt_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Recovery attempt '{attempt_id}' not found")
    return RecoveryAttemptOut.model_validate(row)
