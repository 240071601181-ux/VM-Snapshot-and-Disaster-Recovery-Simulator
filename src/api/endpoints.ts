/**
 * Typed endpoint functions for every backend resource used by the UI.
 * All functions throw ApiError on failure — no silent fallbacks.
 */

import { apiFetch } from './client';
import {
  BackendAuditEvent,
  BackendDashboard,
  BackendFailureEvent,
  BackendRecoveryAttempt,
  BackendRecoveryExecuteResult,
  BackendSnapshot,
  BackendSnapshotDiff,
  BackendVM,
  Paginated,
} from './dto';

export interface CreateVmPayload {
  name: string;
  description?: string;
  environment: 'production' | 'staging' | 'development';
  os: string;
  hardware: { cpu_cores: number; memory_mb: number; disk_size_gb: number };
  power_state?: string;
}

export const vmsApi = {
  list: (page = 1, pageSize = 100) =>
    apiFetch<Paginated<BackendVM>>(`/api/vms?page=${page}&page_size=${pageSize}`),
  get: (id: string) => apiFetch<BackendVM>(`/api/vms/${encodeURIComponent(id)}`),
  create: (payload: CreateVmPayload) =>
    apiFetch<BackendVM>('/api/vms', { method: 'POST', body: payload }),
  delete: (id: string) =>
    apiFetch<void>(`/api/vms/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  start: (id: string) =>
    apiFetch<BackendVM>(`/api/vms/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  stop: (id: string) =>
    apiFetch<BackendVM>(`/api/vms/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
  restart: (id: string) =>
    apiFetch<BackendVM>(`/api/vms/${encodeURIComponent(id)}/restart`, { method: 'POST' }),
  listSnapshots: (vmId: string, page = 1, pageSize = 100) =>
    apiFetch<Paginated<BackendSnapshot>>(
      `/api/vms/${encodeURIComponent(vmId)}/snapshots?page=${page}&page_size=${pageSize}`
    ),
  takeSnapshot: (vmId: string, payload: { name: string; description?: string; is_consistent?: boolean }) =>
    apiFetch<BackendSnapshot>(`/api/vms/${encodeURIComponent(vmId)}/snapshots`, {
      method: 'POST',
      body: payload,
    }),
};

export const snapshotsApi = {
  list: (page = 1, pageSize = 100, vmId?: string) =>
    apiFetch<Paginated<BackendSnapshot>>(
      `/api/snapshots?page=${page}&page_size=${pageSize}${vmId ? `&vm_id=${encodeURIComponent(vmId)}` : ''}`
    ),
  get: (id: string) => apiFetch<BackendSnapshot>(`/api/snapshots/${encodeURIComponent(id)}`),
  delete: (id: string) =>
    apiFetch<void>(`/api/snapshots/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  diff: (id: string, vmId?: string) =>
    apiFetch<BackendSnapshotDiff>(
      `/api/snapshots/${encodeURIComponent(id)}/diff${vmId ? `?vm_id=${encodeURIComponent(vmId)}` : ''}`
    ),
  restore: (id: string, vmId: string) =>
    apiFetch<BackendVM>(`/api/snapshots/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: { vm_id: vmId },
    }),
};

export type FailureScenario =
  | 'application_crash'
  | 'configuration_corruption'
  | 'service_outage'
  | 'failed_health_check'
  | 'interrupted_recovery';

export const failuresApi = {
  list: (page = 1, pageSize = 100, vmId?: string) =>
    apiFetch<Paginated<BackendFailureEvent>>(
      `/api/failures?page=${page}&page_size=${pageSize}${vmId ? `&vm_id=${encodeURIComponent(vmId)}` : ''}`
    ),
  inject: (vmId: string, scenario: FailureScenario, description?: string) =>
    apiFetch<BackendFailureEvent>('/api/failures', {
      method: 'POST',
      body: { vm_id: vmId, scenario, description: description ?? '' },
    }),
};

export const recoveryApi = {
  list: (page = 1, pageSize = 100, vmId?: string) =>
    apiFetch<Paginated<BackendRecoveryAttempt>>(
      `/api/recovery?page=${page}&page_size=${pageSize}${vmId ? `&vm_id=${encodeURIComponent(vmId)}` : ''}`
    ),
  execute: (payload: {
    vm_id: string;
    snapshot_id: string;
    confirmed: boolean;
    health_check?: 'auto' | 'pass' | 'fail';
    notes?: string;
  }) =>
    apiFetch<BackendRecoveryExecuteResult>('/api/recovery/execute', {
      method: 'POST',
      body: payload,
    }),
};

export const auditApi = {
  list: (page = 1, pageSize = 100) =>
    apiFetch<Paginated<BackendAuditEvent>>(`/api/audit?page=${page}&page_size=${pageSize}`),
};

export const dashboardApi = {
  get: () => apiFetch<BackendDashboard>('/api/dashboard'),
};
