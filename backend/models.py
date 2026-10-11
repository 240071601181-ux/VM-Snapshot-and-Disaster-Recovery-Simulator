"""
models.py – SQLAlchemy ORM models for the VM Snapshot & DR Simulator backend.

IMPORTANT SIMULATION NOTICE:
All records in this database represent application-level metadata only.
VirtualBox (or any real hypervisor) is the source of truth for actual VM and
snapshot state. This database does NOT invent real snapshots or execute
VBoxManage commands. Reconciliation against hypervisor data will be implemented
in a future integration phase.

No passwords or secrets are stored in any table.
"""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Float, Integer, String, Text

from database import Base


def _utcnow_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


class VMRecord(Base):
    """
    Application-level metadata reference for a simulated virtual machine.

    hardware_json: JSON-serialised SimulatedVirtualHardware
    state_json:    JSON-serialised VMState (simulated, not real guest state)
    """
    __tablename__ = "vm_records"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    environment = Column(String, nullable=False)  # production | staging | development
    os = Column(String, nullable=False, default="")
    hardware_json = Column(Text, nullable=False, default="{}")
    state_json = Column(Text, nullable=False, default="{}")
    active_snapshot_id = Column(String, nullable=True)
    snapshot_count = Column(Integer, nullable=False, default=0)
    created_at = Column(String, nullable=False, default=_utcnow_iso)
    updated_at = Column(String, nullable=False, default=_utcnow_iso)


class SnapshotMetadata(Base):
    """
    Application-level metadata for a simulated snapshot.

    NOTE: This is NOT a real VirtualBox snapshot record. It stores metadata
    about snapshots managed within the simulator. Mark demo/injected records
    with '[MOCK SIMULATION DATA]' prefix in the description field.

    state_json:    JSON-serialised capture of the VM power state at take time
                   (e.g. {"power_state": "running"}). Deep-copied on capture so
                   later VM mutations cannot alter this snapshot (immutable).
    hardware_json: JSON-serialised SimulatedVirtualHardware captured at take time.
    """
    __tablename__ = "snapshot_metadata"

    id = Column(String, primary_key=True, index=True)
    vm_id = Column(String, nullable=False, index=True)
    vm_name = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    created_at = Column(String, nullable=False, default=_utcnow_iso)
    size_bytes = Column(Integer, nullable=False, default=0)
    is_consistent = Column(Boolean, nullable=False, default=True)
    schema_version = Column(String, nullable=False, default="1.0")
    environment = Column(String, nullable=True)
    os = Column(String, nullable=True)
    parent_snapshot_id = Column(String, nullable=True)
    tree_depth = Column(Integer, nullable=False, default=0)
    state_json = Column(Text, nullable=False, default="{}")
    hardware_json = Column(Text, nullable=False, default="{}")


class RecoveryAttempt(Base):
    """
    Record of a disaster-recovery attempt (restore from snapshot).
    """
    __tablename__ = "recovery_attempts"

    id = Column(String, primary_key=True, index=True)
    vm_id = Column(String, nullable=False, index=True)
    vm_name = Column(String, nullable=False)
    failure_event_id = Column(String, nullable=True)
    target_snapshot_id = Column(String, nullable=False)
    target_snapshot_name = Column(String, nullable=False)
    attempted_at = Column(String, nullable=False, default=_utcnow_iso)
    completed_at = Column(String, nullable=True)
    status = Column(String, nullable=False, default="initiated")
    calculated_rto_seconds = Column(Float, nullable=False, default=0.0)
    calculated_rpo_seconds = Column(Float, nullable=False, default=0.0)
    restored_checksum_match = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)


class FailureEvent(Base):
    """
    Simulation-only record of a controlled failure injected into one VM.

    Only the targeted VM's application state is ever modified; no host
    commands are executed and no real system files are touched.
    """
    __tablename__ = "failure_events"

    id = Column(String, primary_key=True, index=True)
    vm_id = Column(String, nullable=False, index=True)
    vm_name = Column(String, nullable=False)
    scenario = Column(String, nullable=False)  # application_crash | ...
    failure_type = Column(String, nullable=False)  # frontend-aligned FailureType
    severity = Column(String, nullable=False, default="error")
    description = Column(Text, nullable=False, default="")
    injected_at = Column(String, nullable=False, default=_utcnow_iso)
    impact_summary = Column(Text, nullable=False, default="")
    auto_recoverable = Column(Boolean, nullable=False, default=True)


class AuditEvent(Base):
    """
    Immutable chronological audit log entry.
    Entries should NOT be deleted or overwritten once written.
    """
    __tablename__ = "audit_events"

    id = Column(String, primary_key=True, index=True)
    timestamp = Column(String, nullable=False, default=_utcnow_iso, index=True)
    type = Column(String, nullable=False, index=True)
    vm_id = Column(String, nullable=True, index=True)
    vm_name = Column(String, nullable=True)
    title = Column(String, nullable=False)
    details = Column(Text, nullable=False)
    operator = Column(String, nullable=False)
    severity = Column(String, nullable=False)  # info | warning | error | success
