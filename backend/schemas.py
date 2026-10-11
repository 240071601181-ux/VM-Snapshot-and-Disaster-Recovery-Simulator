"""
schemas.py – Pydantic v2 request/response schemas for all API endpoints.

Validation rules match the frontend type constraints defined in src/types/index.ts.
All timestamps are UTC ISO 8601 strings.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


EnvironmentType = Literal["production", "staging", "development"]
SeverityType = Literal["info", "warning", "error", "success"]
RecoveryStatusType = Literal["initiated", "in_progress", "succeeded", "failed"]
PowerStateType = Literal["running", "stopped", "paused", "crashed", "corrupted"]

AuditEventTypeStr = Literal[
    "vm_created",
    "vm_power_changed",
    "vm_deleted",
    "snapshot_taken",
    "snapshot_restored",
    "snapshot_deleted",
    "failure_injected",
    "recovery_initiated",
    "recovery_succeeded",
    "recovery_failed",
    "demo_reset",
]

# ---------------------------------------------------------------------------
# Error response
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    error: str
    detail: str = ""


# ---------------------------------------------------------------------------
# Hardware sub-schema
# ---------------------------------------------------------------------------

class HardwareSchema(BaseModel):
    cpu_cores: int = Field(..., ge=1, le=128)
    memory_mb: int = Field(..., ge=512, le=524288)
    disk_size_gb: int = Field(..., ge=10, le=16384)


# ---------------------------------------------------------------------------
# VM Record
# ---------------------------------------------------------------------------

class VMRecordCreate(BaseModel):
    id: str = Field(default_factory=_new_id)
    name: str
    description: str = ""
    environment: EnvironmentType
    os: str = ""
    hardware: HardwareSchema
    power_state: PowerStateType = "stopped"
    active_snapshot_id: Optional[str] = None
    snapshot_count: int = Field(default=0, ge=0)
    created_at: str = Field(default_factory=_utcnow)
    updated_at: str = Field(default_factory=_utcnow)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("VM name cannot be blank")
        return v.strip()


class VMRecordUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    environment: Optional[EnvironmentType] = None
    os: Optional[str] = None
    hardware: Optional[HardwareSchema] = None
    active_snapshot_id: Optional[str] = None
    snapshot_count: Optional[int] = Field(default=None, ge=0)
    updated_at: str = Field(default_factory=_utcnow)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("VM name cannot be blank")
        return v.strip() if v else v


class VMRecordOut(BaseModel):
    id: str
    name: str
    description: str
    environment: str
    os: str
    hardware: dict[str, Any]
    power_state: str = "stopped"
    active_snapshot_id: Optional[str]
    snapshot_count: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class PaginatedVMResponse(BaseModel):
    items: list[VMRecordOut]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------------------------------------------------------------------------
# Snapshot Metadata
# ---------------------------------------------------------------------------

class SnapshotMetadataCreate(BaseModel):
    id: str = Field(default_factory=_new_id)
    vm_id: str
    vm_name: str
    name: str
    description: str = ""
    created_at: str = Field(default_factory=_utcnow)
    size_bytes: int = Field(default=0, ge=0)
    is_consistent: bool = True
    schema_version: str = "1.0"
    environment: Optional[EnvironmentType] = None
    os: Optional[str] = None
    parent_snapshot_id: Optional[str] = None
    tree_depth: int = Field(default=0, ge=0)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Snapshot name cannot be blank")
        return v.strip()

    @field_validator("vm_id")
    @classmethod
    def vm_id_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("vm_id cannot be blank")
        return v.strip()


class SnapshotMetadataOut(BaseModel):
    id: str
    vm_id: str
    vm_name: str
    name: str
    description: str
    created_at: str
    size_bytes: int
    is_consistent: bool
    schema_version: str
    environment: Optional[str]
    os: Optional[str]
    parent_snapshot_id: Optional[str]
    tree_depth: int
    # Captured simulated state (Phase 6: lets clients display/compare the
    # frozen VM state without a second request). Additive – older clients
    # that ignore unknown fields are unaffected.
    power_state: str = "stopped"
    hardware: dict[str, Any] = {}

    model_config = {"from_attributes": True}


class PaginatedSnapshotResponse(BaseModel):
    items: list[SnapshotMetadataOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class SnapshotTakeRequest(BaseModel):
    """Body for POST /api/vms/{vm_id}/snapshots – capture current simulated state."""

    name: str
    description: str = ""
    is_consistent: bool = True

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Snapshot name cannot be blank")
        return v.strip()


class SnapshotRestoreRequest(BaseModel):
    """Body for POST /api/snapshots/{snapshot_id}/restore."""

    vm_id: str

    @field_validator("vm_id")
    @classmethod
    def vm_id_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("vm_id cannot be blank")
        return v.strip()


class PowerStateDiff(BaseModel):
    snapshot: str
    current: str
    changed: bool


class HardwareFieldDiff(BaseModel):
    snapshot: int
    current: int
    changed: bool


class HardwareDiffOut(BaseModel):
    cpu_cores: HardwareFieldDiff
    memory_mb: HardwareFieldDiff
    disk_size_gb: HardwareFieldDiff
    has_changes: bool


class SnapshotDiffOut(BaseModel):
    snapshot_id: str
    vm_id: str
    power_state_diff: PowerStateDiff
    hardware_diff: HardwareDiffOut
    has_any_differences: bool


# ---------------------------------------------------------------------------
# Recovery Attempt
# ---------------------------------------------------------------------------

class RecoveryAttemptCreate(BaseModel):
    id: str = Field(default_factory=_new_id)
    vm_id: str
    vm_name: str
    failure_event_id: Optional[str] = None
    target_snapshot_id: str
    target_snapshot_name: str
    attempted_at: str = Field(default_factory=_utcnow)
    completed_at: Optional[str] = None
    status: RecoveryStatusType = "initiated"
    calculated_rto_seconds: float = Field(default=0.0, ge=0)
    calculated_rpo_seconds: float = Field(default=0.0, ge=0)
    restored_checksum_match: bool = False
    notes: Optional[str] = None

    @field_validator("vm_id", "target_snapshot_id", "target_snapshot_name", "vm_name")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be blank")
        return v.strip()


class RecoveryAttemptOut(BaseModel):
    id: str
    vm_id: str
    vm_name: str
    failure_event_id: Optional[str]
    target_snapshot_id: str
    target_snapshot_name: str
    attempted_at: str
    completed_at: Optional[str]
    status: str
    calculated_rto_seconds: float
    calculated_rpo_seconds: float
    restored_checksum_match: bool
    notes: Optional[str]

    model_config = {"from_attributes": True}


class PaginatedRecoveryResponse(BaseModel):
    items: list[RecoveryAttemptOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class RecoveryExecuteRequest(BaseModel):
    """Body for POST /api/recovery/execute – guarded DR workflow (Phase 5)."""

    vm_id: str
    snapshot_id: str
    confirmed: bool = False
    health_check: Literal["auto", "pass", "fail"] = "auto"
    notes: Optional[str] = None

    @field_validator("vm_id", "snapshot_id")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be blank")
        return v.strip()

    @field_validator("confirmed")
    @classmethod
    def must_confirm(cls, v: bool) -> bool:
        if v is not True:
            raise ValueError("Explicit confirmation is required before restoration")
        return v


class HealthCheckOut(BaseModel):
    passed: bool
    detail: str


class RecoveryExecuteOut(BaseModel):
    attempt: RecoveryAttemptOut
    vm: VMRecordOut
    current_state_before: str
    target_state: str
    health_check: HealthCheckOut
    elapsed_seconds: float


# ---------------------------------------------------------------------------
# Failure Events (Phase 5 – simulation only)
# ---------------------------------------------------------------------------

FailureScenarioType = Literal[
    "application_crash",
    "configuration_corruption",
    "service_outage",
    "failed_health_check",
    "interrupted_recovery",
]


class FailureInjectRequest(BaseModel):
    vm_id: str
    scenario: FailureScenarioType
    description: str = ""

    @field_validator("vm_id")
    @classmethod
    def vm_id_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("vm_id cannot be blank")
        return v.strip()


class FailureEventOut(BaseModel):
    id: str
    vm_id: str
    vm_name: str
    scenario: str
    failure_type: str
    severity: str
    description: str
    injected_at: str
    impact_summary: str
    auto_recoverable: bool

    model_config = {"from_attributes": True}


class PaginatedFailureResponse(BaseModel):
    items: list[FailureEventOut]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------------------------------------------------------------------------
# Audit Event
# ---------------------------------------------------------------------------

class AuditEventCreate(BaseModel):
    id: str = Field(default_factory=_new_id)
    timestamp: str = Field(default_factory=_utcnow)
    type: AuditEventTypeStr
    vm_id: Optional[str] = None
    vm_name: Optional[str] = None
    title: str
    details: str
    operator: str
    severity: SeverityType

    @field_validator("title", "details", "operator")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be blank")
        return v.strip()


class AuditEventOut(BaseModel):
    id: str
    timestamp: str
    type: str
    vm_id: Optional[str]
    vm_name: Optional[str]
    title: str
    details: str
    operator: str
    severity: str

    model_config = {"from_attributes": True}


class PaginatedAuditResponse(BaseModel):
    items: list[AuditEventOut]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------------------------------------------------------------------------
# Dashboard Summary
# ---------------------------------------------------------------------------

class DashboardSummary(BaseModel):
    total_vms: int
    total_snapshots: int
    total_recovery_attempts: int
    successful_recoveries: int
    failed_recoveries: int
    success_rate_percent: float
    mean_time_to_recovery_seconds: float
    total_audit_events: int
