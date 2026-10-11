"""
routers/audit.py – Audit event endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

import models
from database import get_db
from schemas import AuditEventCreate, AuditEventOut, PaginatedAuditResponse

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=PaginatedAuditResponse)
def list_audit_events(
    vm_id: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> PaginatedAuditResponse:
    try:
        q = db.query(models.AuditEvent)
        if vm_id:
            q = q.filter(models.AuditEvent.vm_id == vm_id)
        if type:
            q = q.filter(models.AuditEvent.type == type)
        total = q.count()
        offset = (page - 1) * page_size
        rows = (
            q.order_by(models.AuditEvent.timestamp.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    total_pages = max(1, (total + page_size - 1) // page_size)
    items = [AuditEventOut.model_validate(r) for r in rows]
    return PaginatedAuditResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=AuditEventOut, status_code=201)
def create_audit_event(
    payload: AuditEventCreate, db: Session = Depends(get_db)
) -> AuditEventOut:
    try:
        existing = db.query(models.AuditEvent).filter(models.AuditEvent.id == payload.id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    if existing:
        raise HTTPException(status_code=409, detail=f"Audit event '{payload.id}' already exists")

    try:
        row = models.AuditEvent(
            id=payload.id,
            timestamp=payload.timestamp,
            type=payload.type,
            vm_id=payload.vm_id,
            vm_name=payload.vm_name,
            title=payload.title,
            details=payload.details,
            operator=payload.operator,
            severity=payload.severity,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error occurred") from exc

    return AuditEventOut.model_validate(row)
