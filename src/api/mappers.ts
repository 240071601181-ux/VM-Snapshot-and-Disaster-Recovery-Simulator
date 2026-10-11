/**
 * Mappers: backend snake_case DTOs -> camelCase UI domain types.
 *
 * Honesty rule: fields the backend does not simulate (guest processes,
 * filesystem inodes, network counters, IPs) are mapped to explicit empty /
 * zero placeholders — never fabricated to look like live guest telemetry.
 * The UI treats these as "not reported by backend" rather than real data.
 */

import {
  AuditEvent,
  AuditEventType,
  RecoveryAttempt,
  Snapshot,
  VirtualMachine,
  VMEnvironment,
  VMExecutionState,
} from '../types';
import {
  BackendAuditEvent,
  BackendDashboard,
  BackendRecoveryAttempt,
  BackendSnapshot,
  BackendVM,
} from './dto';

const VALID_POWER_STATES: VMExecutionState[] = [
  'running',
  'stopped',
  'paused',
  'crashed',
  'corrupted',
];

function toPowerState(raw: unknown): VMExecutionState {
  return VALID_POWER_STATES.includes(raw as VMExecutionState)
    ? (raw as VMExecutionState)
    : 'stopped';
}

function toEnvironment(raw: unknown): VMEnvironment {
  return raw === 'production' || raw === 'staging' || raw === 'development'
    ? raw
    : 'development';
}

function toHardware(raw: Record<string, unknown> | null | undefined): {
  cpuCores: number;
  memoryMb: number;
  diskSizeGb: number;
} {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    cpuCores: num(raw?.cpu_cores ?? raw?.cpuCores),
    memoryMb: num(raw?.memory_mb ?? raw?.memoryMb),
    diskSizeGb: num(raw?.disk_size_gb ?? raw?.diskSizeGb),
  };
}

/** Placeholder guest state: the backend simulates power + config only. */
function placeholderGuestState(powerState: VMExecutionState, osName: string) {
  return {
    powerState,
    osName,
    kernelStatus: 'ok' as const,
    simulatedUptimeSeconds: 0,
    memoryUsageMb: 0,
    cpuUsagePercent: 0,
    processes: [],
    filesystem: [],
    network: {
      ipAddress: 'unassigned',
      connected: powerState === 'running',
      txPackets: 0,
      rxPackets: 0,
    },
  };
}

export function mapBackendVm(dto: BackendVM): VirtualMachine {
  const powerState = toPowerState(dto.power_state);
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? '',
    environment: toEnvironment(dto.environment),
    hardware: toHardware(dto.hardware),
    currentState: placeholderGuestState(powerState, dto.os ?? ''),
    activeSnapshotId: dto.active_snapshot_id,
    snapshotCount: dto.snapshot_count ?? 0,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    os: dto.os ?? '',
  };
}

export function mapBackendSnapshot(dto: BackendSnapshot): Snapshot {
  const powerState = toPowerState(dto.power_state);
  const hardware = toHardware(dto.hardware);
  return {
    id: dto.id,
    vmId: dto.vm_id,
    vmName: dto.vm_name,
    parentSnapshotId: dto.parent_snapshot_id,
    name: dto.name,
    description: dto.description ?? '',
    createdAt: dto.created_at,
    vmConfig: hardware,
    capturedState: placeholderGuestState(powerState, dto.os ?? ''),
    sizeBytes: dto.size_bytes ?? 0,
    isConsistent: dto.is_consistent ?? true,
    treeDepth: dto.tree_depth ?? 0,
    schemaVersion: dto.schema_version ?? '1.0',
    os: dto.os ?? undefined,
    environment: (dto.environment as VMEnvironment | null) ?? undefined,
  };
}

const VALID_AUDIT_TYPES: AuditEventType[] = [
  'vm_created',
  'vm_power_changed',
  'vm_deleted',
  'snapshot_taken',
  'snapshot_restored',
  'snapshot_deleted',
  'failure_injected',
  'recovery_initiated',
  'recovery_succeeded',
  'recovery_failed',
  'demo_reset',
];

export function mapBackendAuditEvent(dto: BackendAuditEvent): AuditEvent {
  const type: AuditEventType = VALID_AUDIT_TYPES.includes(dto.type as AuditEventType)
    ? (dto.type as AuditEventType)
    : 'demo_reset';
  const severity =
    dto.severity === 'info' ||
    dto.severity === 'warning' ||
    dto.severity === 'error' ||
    dto.severity === 'success'
      ? dto.severity
      : ('info' as const);
  return {
    id: dto.id,
    timestamp: dto.timestamp,
    type,
    vmId: dto.vm_id ?? undefined,
    vmName: dto.vm_name ?? undefined,
    title: dto.title,
    details: dto.details,
    operator: dto.operator,
    severity,
  };
}

export function mapBackendRecoveryAttempt(dto: BackendRecoveryAttempt): RecoveryAttempt {
  const status =
    dto.status === 'initiated' ||
    dto.status === 'in_progress' ||
    dto.status === 'succeeded' ||
    dto.status === 'failed'
      ? dto.status
      : ('initiated' as const);
  return {
    id: dto.id,
    vmId: dto.vm_id,
    vmName: dto.vm_name,
    failureEventId: dto.failure_event_id,
    targetSnapshotId: dto.target_snapshot_id,
    targetSnapshotName: dto.target_snapshot_name,
    attemptedAt: dto.attempted_at,
    completedAt: dto.completed_at,
    status,
    calculatedRtoSeconds: dto.calculated_rto_seconds ?? 0,
    calculatedRpoSeconds: dto.calculated_rpo_seconds ?? 0,
    restoredChecksumMatch: dto.restored_checksum_match ?? false,
    notes: dto.notes ?? undefined,
  };
}

/**
 * Local UI SLA targets. The backend reports measured values only; these
 * thresholds are presentation-layer policy, labelled as such wherever shown.
 */
export const DEFAULT_SLA_TARGETS = {
  targetRtoSeconds: 300,
  targetRpoSeconds: 3600,
} as const;

export function mapBackendDashboard(
  dto: BackendDashboard,
  attempts: RecoveryAttempt[]
): import('../types').DRMetricsSummary {
  const rpoValues = attempts
    .map((a) => a.calculatedRpoSeconds)
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const averageRpo =
    rpoValues.length > 0 ? rpoValues.reduce((s, v) => s + v, 0) / rpoValues.length : 0;
  const completedAt = attempts
    .map((a) => a.completedAt)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .sort();
  return {
    totalSnapshots: dto.total_snapshots ?? 0,
    totalRecoveryAttempts: dto.total_recovery_attempts ?? 0,
    successfulRecoveries: dto.successful_recoveries ?? 0,
    failedRecoveries: dto.failed_recoveries ?? 0,
    successRatePercent: dto.success_rate_percent ?? 0,
    meanTimeToRecoverySeconds: dto.mean_time_to_recovery_seconds ?? 0,
    // Derived client-side from loaded attempts (real data, not backend metric).
    averageDataLossWindowSeconds: Math.round(averageRpo * 100) / 100,
    targetRtoSeconds: DEFAULT_SLA_TARGETS.targetRtoSeconds,
    targetRpoSeconds: DEFAULT_SLA_TARGETS.targetRpoSeconds,
    lastTestedRecoveryDate: completedAt.length > 0 ? completedAt[completedAt.length - 1] : null,
  };
}
