"""
routers/dashboard.py – Dashboard summary endpoint.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from fastapi import APIRouter, Depends, HTTPException

from database import get_db
import models
from schemas import DashboardSummary, RecoveryAttemptOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

RECENT_HISTORY_LIMIT = 5


@router.get("", response_model=DashboardSummary)
def get_dashboard(db: Session = Depends(get_db)) -> DashboardSummary:
    """Return aggregated summary statistics from the metadata database.

    Metric formulas (all derived from recorded rows – never hardcoded):
      success_rate_percent = 100 * succeeded / total_recovery_attempts,
        or 0.0 when no attempts exist (no division by zero).
      mean_time_to_recovery_seconds = AVG(calculated_rto_seconds) over
        attempts with status == 'succeeded' only, or 0.0 when none.
      failed_recoveries counts status == 'failed' exactly – in-progress
        attempts are reported separately and never counted as failures.
      recent_recovery_attempts = latest 5 attempts by attempted_at desc.
    """
    try:
        total_vms = db.query(func.count(models.VMRecord.id)).scalar() or 0
        total_snapshots = db.query(func.count(models.SnapshotMetadata.id)).scalar() or 0
        total_recovery = db.query(func.count(models.RecoveryAttempt.id)).scalar() or 0
        total_audit = db.query(func.count(models.AuditEvent.id)).scalar() or 0
        total_failures = db.query(func.count(models.FailureEvent.id)).scalar() or 0

        successful = (
            db.query(func.count(models.RecoveryAttempt.id))
            .filter(models.RecoveryAttempt.status == "succeeded")
            .scalar() or 0
        )
        failed = (
            db.query(func.count(models.RecoveryAttempt.id))
            .filter(models.RecoveryAttempt.status == "failed")
            .scalar() or 0
        )
        in_progress = (
            db.query(func.count(models.RecoveryAttempt.id))
            .filter(models.RecoveryAttempt.status == "in_progress")
            .scalar() or 0
        )

        success_rate = (successful / total_recovery * 100) if total_recovery > 0 else 0.0

        # MTTR: mean of rto_seconds for succeeded attempts only
        mttr_row = (
            db.query(func.avg(models.RecoveryAttempt.calculated_rto_seconds))
            .filter(models.RecoveryAttempt.status == "succeeded")
            .scalar()
        )

        recent_rows = (
            db.query(models.RecoveryAttempt)
            .order_by(models.RecoveryAttempt.attempted_at.desc())
            .limit(RECENT_HISTORY_LIMIT)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error occurred") from exc
    mttr = float(mttr_row) if mttr_row is not None else 0.0

    return DashboardSummary(
        total_vms=total_vms,
        total_snapshots=total_snapshots,
        total_recovery_attempts=total_recovery,
        successful_recoveries=successful,
        failed_recoveries=failed,
        success_rate_percent=round(success_rate, 2),
        mean_time_to_recovery_seconds=round(mttr, 2),
        total_audit_events=total_audit,
        total_failure_events=total_failures,
        in_progress_recoveries=in_progress,
        recent_recovery_attempts=[RecoveryAttemptOut.model_validate(r) for r in recent_rows],
    )
