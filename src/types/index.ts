// Domain & Simulator Types - Strictly typed for in-browser simulation

export type VMExecutionState = 'running' | 'stopped' | 'paused' | 'crashed' | 'corrupted';

export interface SimulatedVirtualHardware {
  cpuCores: number;
  memoryMb: number;
  diskSizeGb: number;
}

export interface SimulatedWorkloadProcess {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMb: number;
  status: 'healthy' | 'degraded' | 'failed';
}

export interface SimulatedFilesystemEntry {
  path: string;
  sizeKb: number;
  checksum: string;
  lastModifiedSimulated: string;
}

export interface VMState {
  powerState: VMExecutionState;
  osName: string;
  kernelStatus: 'ok' | 'panic' | 'unresponsive';
  simulatedUptimeSeconds: number;
  memoryUsageMb: number;
  cpuUsagePercent: number;
  processes: SimulatedWorkloadProcess[];
  filesystem: SimulatedFilesystemEntry[];
  network: {
    ipAddress: string;
    connected: boolean;
    txPackets: number;
    rxPackets: number;
  };
}

export type VMEnvironment = 'production' | 'staging' | 'development';

export interface VirtualMachine {
  id: string;
  name: string;
  description: string;
  environment: VMEnvironment;
  hardware: SimulatedVirtualHardware;
  currentState: VMState;
  activeSnapshotId: string | null;
  snapshotCount: number;
  createdAt: string;
  updatedAt: string;
  os?: string;
}

export interface Snapshot {
  id: string;
  vmId: string;
  vmName: string;
  parentSnapshotId: string | null;
  name: string;
  description: string;
  createdAt: string;
  vmConfig: SimulatedVirtualHardware;
  capturedState: VMState;
  sizeBytes: number;
  isConsistent: boolean; // e.g. crash-consistent vs application-consistent
  treeDepth: number;
  schemaVersion?: string; // snapshot schema version, default '1.0'
  os?: string;
  environment?: VMEnvironment;
}

export interface SnapshotDiff {
  snapshotId: string;
  vmId: string;
  powerStateDiff: {
    snapshot: VMExecutionState;
    current: VMExecutionState;
    changed: boolean;
  };
  hardwareDiff: {
    cpuCores: { snapshot: number; current: number; changed: boolean };
    memoryMb: { snapshot: number; current: number; changed: boolean };
    diskSizeGb: { snapshot: number; current: number; changed: boolean };
    hasChanges: boolean;
  };
  processesDiff: {
    addedInCurrent: SimulatedWorkloadProcess[];
    removedInCurrent: SimulatedWorkloadProcess[];
    modified: { process: SimulatedWorkloadProcess; snapshotCpu: number; currentCpu: number }[];
    totalDifferences: number;
  };
  filesystemDiff: {
    addedInCurrent: SimulatedFilesystemEntry[];
    removedInCurrent: SimulatedFilesystemEntry[];
    modified: { path: string; snapshotChecksum: string; currentChecksum: string }[];
    totalDifferences: number;
  };
  hasAnyDifferences: boolean;
}

export type FailureType =
  | 'disk_corruption'
  | 'kernel_panic'
  | 'service_crash'
  | 'ransomware_encryption'
  | 'network_partition'
  | 'power_outage';

export interface FailureEvent {
  id: string;
  vmId: string;
  vmName: string;
  failureType: FailureType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  injectedAt: string;
  impactSummary: string;
  autoRecoverable: boolean;
}

export interface RecoveryAttempt {
  id: string;
  vmId: string;
  vmName: string;
  failureEventId: string | null;
  targetSnapshotId: string;
  targetSnapshotName: string;
  attemptedAt: string;
  completedAt: string | null;
  status: 'initiated' | 'in_progress' | 'succeeded' | 'failed';
  calculatedRtoSeconds: number;
  calculatedRpoSeconds: number;
  restoredChecksumMatch: boolean;
  notes?: string;
}

export type AuditEventType =
  | 'vm_created'
  | 'vm_power_changed'
  | 'vm_deleted'
  | 'snapshot_taken'
  | 'snapshot_restored'
  | 'snapshot_deleted'
  | 'failure_injected'
  | 'recovery_initiated'
  | 'recovery_succeeded'
  | 'recovery_failed'
  | 'demo_reset';

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  vmId?: string;
  vmName?: string;
  title: string;
  details: string;
  operator: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export interface DRMetricsSummary {
  totalSnapshots: number;
  totalRecoveryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  successRatePercent: number;
  meanTimeToRecoverySeconds: number; // MTTR
  averageDataLossWindowSeconds: number; // RPO
  targetRtoSeconds: number;
  targetRpoSeconds: number;
  lastTestedRecoveryDate: string | null;
}

export type NavView = 'dashboard' | 'vms' | 'snapshots' | 'dr-metrics' | 'activity';
