/**
 * useLiveSimulator: backend-backed data source for Live mode.
 *
 * Owns all live collections (VMs, snapshots, audit, recovery, failures,
 * metrics) plus loading/error/mutating flags. Every mutation re-fetches the
 * affected collections so the UI can never show stale state after a change.
 * Nothing here falls back to mock data — failures surface as errors.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuditEvent,
  DRMetricsSummary,
  RecoveryAttempt,
  Snapshot,
  VirtualMachine,
} from '../types';
import { ApiError } from './client';
import {
  auditApi,
  CreateVmPayload,
  dashboardApi,
  failuresApi,
  FailureScenario,
  recoveryApi,
  snapshotsApi,
  vmsApi,
} from './endpoints';
import {
  BackendFailureEvent,
  BackendRecoveryExecuteResult,
  BackendSnapshotDiff,
} from './dto';
import {
  mapBackendAuditEvent,
  mapBackendDashboard,
  mapBackendRecoveryAttempt,
  mapBackendSnapshot,
  mapBackendVm,
} from './mappers';

export type LiveStatus = 'idle' | 'loading' | 'live' | 'error';

const EMPTY_METRICS: DRMetricsSummary = {
  totalSnapshots: 0,
  totalRecoveryAttempts: 0,
  successfulRecoveries: 0,
  failedRecoveries: 0,
  successRatePercent: 0,
  meanTimeToRecoverySeconds: 0,
  averageDataLossWindowSeconds: 0,
  targetRtoSeconds: 0,
  targetRpoSeconds: 0,
  lastTestedRecoveryDate: null,
};

export interface UseLiveSimulator {
  status: LiveStatus;
  error: string | null;
  mutating: boolean;
  vms: VirtualMachine[];
  snapshots: Snapshot[];
  auditEvents: AuditEvent[];
  recoveryAttempts: RecoveryAttempt[];
  failures: BackendFailureEvent[];
  metrics: DRMetricsSummary;
  connect: () => void;
  refreshAll: () => Promise<void>;
  createVm: (payload: CreateVmPayload) => Promise<VirtualMachine>;
  deleteVm: (id: string) => Promise<void>;
  startVm: (id: string) => Promise<VirtualMachine>;
  stopVm: (id: string) => Promise<VirtualMachine>;
  restartVm: (id: string) => Promise<VirtualMachine>;
  takeSnapshot: (vmId: string, name: string, description?: string) => Promise<Snapshot>;
  deleteSnapshot: (id: string) => Promise<void>;
  restoreSnapshot: (snapshotId: string, vmId: string) => Promise<VirtualMachine>;
  fetchDiff: (snapshotId: string, vmId?: string) => Promise<BackendSnapshotDiff>;
  injectFailure: (vmId: string, scenario: FailureScenario) => Promise<BackendFailureEvent>;
  executeRecovery: (args: {
    vmId: string;
    snapshotId: string;
    healthCheck?: 'auto' | 'pass' | 'fail';
  }) => Promise<BackendRecoveryExecuteResult>;
}

export function useLiveSimulator(enabled: boolean): UseLiveSimulator {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [vms, setVms] = useState<VirtualMachine[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [recoveryAttempts, setRecoveryAttempts] = useState<RecoveryAttempt[]>([]);
  const [failures, setFailures] = useState<BackendFailureEvent[]>([]);
  const [metrics, setMetrics] = useState<DRMetricsSummary>(EMPTY_METRICS);
  const requestId = useRef(0);

  const refreshAll = useCallback(async () => {
    const myRequest = ++requestId.current;
    setStatus((prev) => (prev === 'live' ? prev : 'loading'));
    try {
      const [vmPage, snapPage, auditPage, recPage, failPage, dash] = await Promise.all([
        vmsApi.list(),
        snapshotsApi.list(),
        auditApi.list(),
        recoveryApi.list(),
        failuresApi.list(),
        dashboardApi.get(),
      ]);
      if (requestId.current !== myRequest) return;
      const mappedAttempts = recPage.items.map(mapBackendRecoveryAttempt);
      setVms(vmPage.items.map(mapBackendVm));
      setSnapshots(snapPage.items.map(mapBackendSnapshot));
      setAuditEvents(auditPage.items.map(mapBackendAuditEvent));
      setRecoveryAttempts(mappedAttempts);
      setFailures(failPage.items);
      setMetrics(mapBackendDashboard(dash, mappedAttempts));
      setError(null);
      setStatus('live');
    } catch (err: unknown) {
      if (requestId.current !== myRequest) return;
      const message =
        err instanceof ApiError ? err.message : 'Failed to load data from the backend API.';
      setError(message);
      setStatus('error');
    }
  }, []);

  const connect = useCallback(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (enabled) {
      void refreshAll();
    } else {
      requestId.current += 1;
      setStatus('idle');
      setError(null);
    }
  }, [enabled, refreshAll]);

  const mutate = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setMutating(true);
      try {
        const result = await fn();
        await refreshAll();
        return result;
      } finally {
        setMutating(false);
      }
    },
    [refreshAll]
  );

  const createVm = useCallback(
    (payload: CreateVmPayload) =>
      mutate(async () => mapBackendVm(await vmsApi.create(payload))),
    [mutate]
  );
  const deleteVm = useCallback((id: string) => mutate(() => vmsApi.delete(id)), [mutate]);
  const startVm = useCallback(
    (id: string) => mutate(async () => mapBackendVm(await vmsApi.start(id))),
    [mutate]
  );
  const stopVm = useCallback(
    (id: string) => mutate(async () => mapBackendVm(await vmsApi.stop(id))),
    [mutate]
  );
  const restartVm = useCallback(
    (id: string) => mutate(async () => mapBackendVm(await vmsApi.restart(id))),
    [mutate]
  );
  const takeSnapshot = useCallback(
    (vmId: string, name: string, description?: string) =>
      mutate(async () =>
        mapBackendSnapshot(await vmsApi.takeSnapshot(vmId, { name, description: description ?? '' }))
      ),
    [mutate]
  );
  const deleteSnapshot = useCallback(
    (id: string) => mutate(() => snapshotsApi.delete(id)),
    [mutate]
  );
  const restoreSnapshot = useCallback(
    (snapshotId: string, vmId: string) =>
      mutate(async () => mapBackendVm(await snapshotsApi.restore(snapshotId, vmId))),
    [mutate]
  );
  const fetchDiff = useCallback(
    (snapshotId: string, vmId?: string) => snapshotsApi.diff(snapshotId, vmId),
    []
  );
  const injectFailure = useCallback(
    (vmId: string, scenario: FailureScenario) =>
      mutate(() => failuresApi.inject(vmId, scenario)),
    [mutate]
  );
  const executeRecovery = useCallback(
    (args: { vmId: string; snapshotId: string; healthCheck?: 'auto' | 'pass' | 'fail' }) =>
      mutate(() =>
        recoveryApi.execute({
          vm_id: args.vmId,
          snapshot_id: args.snapshotId,
          confirmed: true,
          health_check: args.healthCheck ?? 'auto',
        })
      ),
    [mutate]
  );

  return {
    status,
    error,
    mutating,
    vms,
    snapshots,
    auditEvents,
    recoveryAttempts,
    failures,
    metrics,
    connect,
    refreshAll,
    createVm,
    deleteVm,
    startVm,
    stopVm,
    restartVm,
    takeSnapshot,
    deleteSnapshot,
    restoreSnapshot,
    fetchDiff,
    injectFailure,
    executeRecovery,
  };
}
