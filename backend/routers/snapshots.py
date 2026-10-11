"""
routers/snapshots.py – Snapshot metadata endpoints.
"""

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
)

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


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
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

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
    existing = db.query(models.SnapshotMetadata).filter(models.SnapshotMetadata.id == payload.id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Snapshot with id '{payload.id}' already exists")

    try:
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
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    return SnapshotMetadataOut.model_validate(row)


@router.get("/{snapshot_id}", response_model=SnapshotMetadataOut)
def get_snapshot(snapshot_id: str, db: Session = Depends(get_db)) -> SnapshotMetadataOut:
    try:
        row = db.query(models.SnapshotMetadata).filter(models.SnapshotMetadata.id == snapshot_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Snapshot '{snapshot_id}' not found")
    return SnapshotMetadataOut.model_validate(row)


@router.delete("/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot_id: str, db: Session = Depends(get_db)) -> None:
    try:
        row = db.query(models.SnapshotMetadata).filter(models.SnapshotMetadata.id == snapshot_id).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    if not row:
        raise HTTPException(status_code=404, detail=f"Snapshot '{snapshot_id}' not found")

    try:
        db.delete(row)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
