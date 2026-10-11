/**
 * Backend (FastAPI, snake_case) DTOs. These mirror backend/schemas.py and are
 * intentionally kept separate from the camelCase UI domain types in types/.
 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface BackendVM {
  id: string;
  name: string;
  description: string;
  environment: string;
  os: string;
  hardware: Record<string, unknown>;
  power_state: string;
  active_snapshot_id: string | null;
  snapshot_count: number;
  created_at: string;
  updated_at: string;
}

export interface BackendSnapshot {
  id: string;
  vm_id: string;
  vm_name: string;
  name: string;
  description: string;
  created_at: string;
  size_bytes: number;
  is_consistent: boolean;
  schema_version: string;
  environment: string | null;
  os: string | null;
  parent_snapshot_id: string | null;
  tree_depth: number;
  power_state: string;
  hardware: Record<string, unknown>;
}

export interface BackendAuditEvent {
  id: string;
  timestamp: string;
  type: string;
  vm_id: string | null;
  vm_name: string | null;
  title: string;
  details: string;
  operator: string;
  severity: string;
}

export interface BackendRecoveryAttempt {
  id: string;
  vm_id: string;
  vm_name: string;
  failure_event_id: string | null;
  target_snapshot_id: string;
  target_snapshot_name: string;
  attempted_at: string;
  completed_at: string | null;
  status: string;
  calculated_rto_seconds: number;
  calculated_rpo_seconds: number;
  restored_checksum_match: boolean;
  notes: string | null;
}

export interface BackendFailureEvent {
  id: string;
  vm_id: string;
  vm_name: string;
  scenario: string;
  failure_type: string;
  severity: string;
  description: string;
  injected_at: string;
  impact_summary: string;
  auto_recoverable: boolean;
}

export interface BackendDashboard {
  total_vms: number;
  total_snapshots: number;
  total_recovery_attempts: number;
  successful_recoveries: number;
  failed_recoveries: number;
  success_rate_percent: number;
  mean_time_to_recovery_seconds: number;
  total_audit_events: number;
  total_failure_events: number;
  in_progress_recoveries: number;
  recent_recovery_attempts: BackendRecoveryAttempt[];
}

export interface BackendSnapshotDiff {
  snapshot_id: string;
  vm_id: string;
  power_state_diff: { snapshot: string; current: string; changed: boolean };
  hardware_diff: {
    cpu_cores: { snapshot: number; current: number; changed: boolean };
    memory_mb: { snapshot: number; current: number; changed: boolean };
    disk_size_gb: { snapshot: number; current: number; changed: boolean };
    has_changes: boolean;
  };
  has_any_differences: boolean;
}

export interface BackendRecoveryExecuteResult {
  attempt: BackendRecoveryAttempt;
  vm: BackendVM;
  current_state_before: string;
  target_state: string;
  health_check: { passed: boolean; detail: string };
  elapsed_seconds: number;
}
