"""
routers/vms.py – CRUD endpoints for VM records metadata.
"""

import json

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
)

router = APIRouter(prefix="/api/vms", tags=["vms"])


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
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

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
    existing = db.query(models.VMRecord).filter(models.VMRecord.id == payload.id).first()
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
            state_json="{}",
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
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    return _row_to_out(row)


@router.get("/{vm_id}", response_model=VMRecordOut)
def get_vm(vm_id: str, db: Session = Depends(get_db)) -> VMRecordOut:
    try:
        row = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
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
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
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
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    return _row_to_out(row)


@router.delete("/{vm_id}", status_code=204)
def delete_vm(vm_id: str, db: Session = Depends(get_db)) -> None:
    try:
        row = db.query(models.VMRecord).filter(models.VMRecord.id == vm_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found")

    try:
        db.delete(row)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
