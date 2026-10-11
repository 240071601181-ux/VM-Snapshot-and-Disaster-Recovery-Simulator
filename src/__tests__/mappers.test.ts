import { describe, it, expect } from 'vitest';
import { mapBackendDashboard, mapBackendSnapshot, mapBackendVm } from '../api/mappers';
import { BackendDashboard, BackendSnapshot, BackendVM } from '../api/dto';
import { RecoveryAttempt } from '../types';

const vmDto: BackendVM = {
  id: 'vm-live-01',
  name: 'live-web-01',
  description: 'Live VM',
  environment: 'staging',
  os: 'Ubuntu 24.04 LTS',
  hardware: { cpu_cores: 4, memory_mb: 8192, disk_size_gb: 100 },
  power_state: 'running',
  active_snapshot_id: null,
  snapshot_count: 0,
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
};

describe('backend mappers', () => {
  it('maps VM power, hardware, and environment; placeholders stay empty', () => {
    const vm = mapBackendVm(vmDto);
    expect(vm.id).toBe('vm-live-01');
    expect(vm.currentState.powerState).toBe('running');
    expect(vm.hardware).toEqual({ cpuCores: 4, memoryMb: 8192, diskSizeGb: 100 });
    expect(vm.environment).toBe('staging');
    // Honest placeholders: backend does not simulate guest internals.
    expect(vm.currentState.processes).toEqual([]);
    expect(vm.currentState.filesystem).toEqual([]);
    expect(vm.currentState.network.ipAddress).toBe('unassigned');
    expect(vm.currentState.network.connected).toBe(true);
  });

  it('coerces unknown power states to stopped', () => {
    const vm = mapBackendVm({ ...vmDto, power_state: 'flying' });
    expect(vm.currentState.powerState).toBe('stopped');
  });

  it('maps snapshot captured power and hardware', () => {
    const dto: BackendSnapshot = {
      id: 'snap-1',
      vm_id: 'vm-live-01',
      vm_name: 'live-web-01',
      name: 'baseline',
      description: '',
      created_at: '2026-01-02T00:00:00+00:00',
      size_bytes: 0,
      is_consistent: true,
      schema_version: '1.0',
      environment: 'staging',
      os: 'Ubuntu 24.04 LTS',
      parent_snapshot_id: null,
      tree_depth: 0,
      power_state: 'stopped',
      hardware: { cpu_cores: 2, memory_mb: 4096, disk_size_gb: 50 },
    };
    const snap = mapBackendSnapshot(dto);
    expect(snap.capturedState.powerState).toBe('stopped');
    expect(snap.vmConfig).toEqual({ cpuCores: 2, memoryMb: 4096, diskSizeGb: 50 });
  });

  it('derives RPO average and last-tested date from real attempts only', () => {
    const dash: BackendDashboard = {
      total_vms: 1,
      total_snapshots: 1,
      total_recovery_attempts: 2,
      successful_recoveries: 1,
      failed_recoveries: 1,
      success_rate_percent: 50,
      mean_time_to_recovery_seconds: 100,
      total_audit_events: 0,
    };
    const attempts: RecoveryAttempt[] = [
      {
        id: 'r1', vmId: 'v', vmName: 'v', failureEventId: null,
        targetSnapshotId: 's', targetSnapshotName: 's',
        attemptedAt: '2026-01-03T00:00:00+00:00', completedAt: '2026-01-03T00:01:00+00:00',
        status: 'succeeded', calculatedRtoSeconds: 60, calculatedRpoSeconds: 120,
        restoredChecksumMatch: true,
      },
      {
        id: 'r2', vmId: 'v', vmName: 'v', failureEventId: null,
        targetSnapshotId: 's', targetSnapshotName: 's',
        attemptedAt: '2026-01-04T00:00:00+00:00', completedAt: null,
        status: 'in_progress', calculatedRtoSeconds: 0, calculatedRpoSeconds: 0,
        restoredChecksumMatch: false,
      },
    ];
    const metrics = mapBackendDashboard(dash, attempts);
    expect(metrics.successRatePercent).toBe(50);
    expect(metrics.averageDataLossWindowSeconds).toBe(120);
    expect(metrics.lastTestedRecoveryDate).toBe('2026-01-03T00:01:00+00:00');
    // SLA thresholds are local UI policy, documented in mappers.ts.
    expect(metrics.targetRtoSeconds).toBeGreaterThan(0);
  });
});
