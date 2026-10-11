import React, { useEffect, useState, useRef } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { NavView, Snapshot, VirtualMachine } from './types';
import {
  SIMULATED_VMS,
  SIMULATED_SNAPSHOTS,
  SIMULATED_AUDIT_EVENTS,
  SIMULATED_DR_METRICS,
  SIMULATED_RECOVERY_ATTEMPTS,
} from './mock/simulatedData';
import { VMLifecycleEngine, CreateVMOptions } from './engine/VMLifecycleEngine';
import { VMLifecycleError } from './engine/errors';
import { SimulatorBanner } from './components/common/SimulatorBanner';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { VMInventoryTable } from './components/vms/VMInventoryTable';
import { SnapshotHistorySection } from './components/snapshots/SnapshotHistorySection';
import { DRMetricsSection } from './components/disasterRecovery/DRMetricsSection';
import { RecoveryConsole } from './components/disasterRecovery/RecoveryConsole';
import { RecentActivityPanel } from './components/audit/RecentActivityPanel';
import { VMDetailsModal } from './components/vms/VMDetailsModal';
import { CreateVMModal } from './components/vms/CreateVMModal';
import { DeleteConfirmModal } from './components/vms/DeleteConfirmModal';
import { ConfirmModal } from './components/common/ConfirmModal';
import { TakeSnapshotModal } from './components/snapshots/TakeSnapshotModal';
import { RestoreConfirmModal } from './components/snapshots/RestoreConfirmModal';
import { LoadingSpinner, ErrorAlert } from './components/common/FeedbackStates';
import { DataSource } from './components/common/DataSourceBadge';
import { useLiveSimulator } from './api/useLiveSimulator';
import { ApiError } from './api/client';
import { BackendSnapshotDiff } from './api/dto';

const toApiErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof ApiError || err instanceof Error) return err.message;
  return fallback;
};

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [selectedVM, setSelectedVM] = useState<VirtualMachine | null>(null);

  // Demo vs Live backend data source. Demo preserves the original in-browser
  // simulation; Live talks to the FastAPI backend and never mixes in mocks.
  const [dataSource, setDataSource] = useState<DataSource>('demo');
  const isLive = dataSource === 'live';
  const live = useLiveSimulator(isLive);

  // Modal dialog states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [vmToDelete, setVmToDelete] = useState<VirtualMachine | null>(null);
  const [isTakeSnapshotOpen, setIsTakeSnapshotOpen] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] = useState<Snapshot | null>(null);
  const [restoreDiff, setRestoreDiff] = useState<BackendSnapshotDiff | null>(null);
  const [restoreDiffLoading, setRestoreDiffLoading] = useState(false);
  const [snapshotToDelete, setSnapshotToDelete] = useState<Snapshot | null>(null);

  // User-facing lifecycle notification banner
  const [lifecycleNotification, setLifecycleNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Simulated operational UI state flags
  const [isSimulatingLoading, setIsSimulatingLoading] = useState(false);
  const [isSimulatingError, setIsSimulatingError] = useState(false);

  // Initialize pure in-browser lifecycle engine
  const engineRef = useRef<VMLifecycleEngine>(new VMLifecycleEngine(SIMULATED_VMS));

  // Reactive state derived from the simulation engine
  const [vms, setVms] = useState<VirtualMachine[]>(() => engineRef.current.getAllVMs());
  const [snapshots] = useState(SIMULATED_SNAPSHOTS);
  const [auditEvents, setAuditEvents] = useState(() => [
    ...engineRef.current.getAuditEvents(),
    ...SIMULATED_AUDIT_EVENTS,
  ]);
  const [drMetrics] = useState(SIMULATED_DR_METRICS);
  const [recoveryAttempts] = useState(SIMULATED_RECOVERY_ATTEMPTS);

  // Effective collections by data source (never mixed).
  const effectiveVms = isLive ? live.vms : vms;
  const effectiveSnapshots = isLive ? live.snapshots : snapshots;
  const effectiveAuditEvents = isLive ? live.auditEvents : auditEvents;
  const effectiveMetrics = isLive ? live.metrics : drMetrics;
  const effectiveRecoveryAttempts = isLive ? live.recoveryAttempts : recoveryAttempts;

  // Keep the inspector modal fresh after live refreshes.
  useEffect(() => {
    if (isLive && selectedVM) {
      const fresh = live.vms.find((v) => v.id === selectedVM.id) ?? null;
      if (fresh && fresh.updatedAt !== selectedVM.updatedAt) {
        setSelectedVM(fresh);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.vms, isLive]);

  // Leaving Live mode closes live-only dialogs and inspector state.
  useEffect(() => {
    if (!isLive) {
      setIsTakeSnapshotOpen(false);
      setSnapshotToRestore(null);
      setSnapshotToDelete(null);
      setRestoreDiff(null);
    }
  }, [isLive]);

  const syncStateFromEngine = () => {
    const updatedVms = engineRef.current.getAllVMs();
    setVms(updatedVms);
    setAuditEvents([...engineRef.current.getAuditEvents(), ...SIMULATED_AUDIT_EVENTS]);

    // Keep active inspector modal updated if open
    if (selectedVM) {
      const refreshedVM = updatedVms.find((v) => v.id === selectedVM.id) || null;
      setSelectedVM(refreshedVM);
    }
  };

  const notifyUser = (type: 'success' | 'error', message: string) => {
    setLifecycleNotification({ type, message });
    setTimeout(() => {
      setLifecycleNotification((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // Lifecycle Operations Handlers (demo engine vs live backend API)
  const handleStartVM = async (id: string) => {
    if (!isLive) {
      try {
        const vm = engineRef.current.startVM(id);
        syncStateFromEngine();
        notifyUser('success', `Simulated VM '${vm.name}' booted successfully.`);
      } catch (err: unknown) {
        const message = err instanceof VMLifecycleError || err instanceof Error ? err.message : 'Failed to start VM';
        notifyUser('error', message);
      }
      return;
    }
    try {
      const vm = await live.startVm(id);
      notifyUser('success', `Backend VM '${vm.name}' is now ${vm.currentState.powerState}.`);
    } catch (err: unknown) {
      notifyUser('error', toApiErrorMessage(err, 'Failed to start VM'));
    }
  };

  const handleStopVM = async (id: string) => {
    if (!isLive) {
      try {
        const vm = engineRef.current.stopVM(id);
        syncStateFromEngine();
        notifyUser('success', `Simulated VM '${vm.name}' halted.`);
      } catch (err: unknown) {
        const message = err instanceof VMLifecycleError || err instanceof Error ? err.message : 'Failed to stop VM';
        notifyUser('error', message);
      }
      return;
    }
    try {
      const vm = await live.stopVm(id);
      notifyUser('success', `Backend VM '${vm.name}' is now ${vm.currentState.powerState}.`);
    } catch (err: unknown) {
      notifyUser('error', toApiErrorMessage(err, 'Failed to stop VM'));
    }
  };

  const handleRestartVM = async (id: string) => {
    if (!isLive) {
      try {
        const vm = engineRef.current.restartVM(id);
        syncStateFromEngine();
        notifyUser('success', `Simulated VM '${vm.name}' reboot sequence completed.`);
      } catch (err: unknown) {
        const message = err instanceof VMLifecycleError || err instanceof Error ? err.message : 'Failed to restart VM';
        notifyUser('error', message);
      }
      return;
    }
    try {
      const vm = await live.restartVm(id);
      notifyUser('success', `Backend VM '${vm.name}' rebooted (${vm.currentState.powerState}).`);
    } catch (err: unknown) {
      notifyUser('error', toApiErrorMessage(err, 'Failed to restart VM'));
    }
  };

  const handleCreateVM = async (options: CreateVMOptions) => {
    if (!isLive) {
      const newVM = engineRef.current.createVM(options);
      syncStateFromEngine();
      notifyUser('success', `Created simulated VM '${newVM.name}' (${newVM.os}).`);
      return;
    }
    const created = await live.createVm({
      name: options.name,
      description: options.description ?? '',
      environment: options.environment,
      os: options.os,
      hardware: {
        cpu_cores: options.hardware.cpuCores,
        memory_mb: options.hardware.memoryMb,
        disk_size_gb: options.hardware.diskSizeGb,
      },
    });
    notifyUser('success', `Backend VM '${created.name}' created (${created.id}).`);
  };

  const handleDeleteVM = async (vmId: string, confirmationName: string) => {
    if (!isLive) {
      engineRef.current.deleteVM(vmId, confirmationName);
      syncStateFromEngine();
      if (selectedVM?.id === vmId) {
        setSelectedVM(null);
      }
      setVmToDelete(null);
      notifyUser('success', `Simulated VM '${confirmationName}' successfully deleted.`);
      return;
    }
    await live.deleteVm(vmId);
    if (selectedVM?.id === vmId) {
      setSelectedVM(null);
    }
    setVmToDelete(null);
    notifyUser('success', `Backend VM '${confirmationName}' deleted.`);
  };

  // Live snapshot handlers
  const handleTakeSnapshot = async (vmId: string, name: string, description: string) => {
    const snap = await live.takeSnapshot(vmId, name, description);
    notifyUser('success', `Backend snapshot '${snap.name}' captured for ${snap.vmName}.`);
  };

  const openRestoreDialog = async (snap: Snapshot) => {
    setSnapshotToRestore(snap);
    setRestoreDiff(null);
    setRestoreDiffLoading(true);
    try {
      const diff = await live.fetchDiff(snap.id);
      setRestoreDiff(diff);
    } catch (err: unknown) {
      notifyUser('error', toApiErrorMessage(err, 'Failed to compare snapshot.'));
      setSnapshotToRestore(null);
    } finally {
      setRestoreDiffLoading(false);
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!snapshotToRestore) return;
    const restored = await live.restoreSnapshot(snapshotToRestore.id, snapshotToRestore.vmId);
    notifyUser(
      'success',
      `Backend VM '${restored.name}' restored to '${snapshotToRestore.name}' (${restored.currentState.powerState}).`
    );
  };

  const handleDeleteSnapshot = async () => {
    if (!snapshotToDelete) return;
    await live.deleteSnapshot(snapshotToDelete.id);
    notifyUser('success', `Backend snapshot '${snapshotToDelete.name}' deleted.`);
  };

  const restoreCurrentPower =
    (snapshotToRestore && live.vms.find((v) => v.id === snapshotToRestore.vmId)?.currentState.powerState) ??
    'unknown';

  const liveLoading = isLive && live.status === 'loading';
  const liveError = isLive && live.status === 'error' ? live.error : null;

  return (
    <div className="app-shell" data-testid="app-shell">
      {/* Persistent Simulator Disclaimer Header */}
      <SimulatorBanner />

      <div className="app-body">
        {/* Navigation Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          vmCount={effectiveVms.length}
          snapshotCount={effectiveSnapshots.length}
          activityCount={effectiveAuditEvents.length}
        />

        {/* Main Content Viewport */}
        <div className="main-wrapper">
          <Header
            currentView={currentView}
            isSimulatingLoading={isSimulatingLoading}
            isSimulatingError={isSimulatingError}
            onSimulateLoadingToggle={() => setIsSimulatingLoading((prev) => !prev)}
            onSimulateErrorToggle={() => setIsSimulatingError((prev) => !prev)}
            dataSource={dataSource}
            onToggleDataSource={setDataSource}
          />

          <main className="page-container" role="main">
            {/* User notification toast */}
            {lifecycleNotification && (
              <div
                data-testid={`lifecycle-toast-${lifecycleNotification.type}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  background:
                    lifecycleNotification.type === 'error'
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                  border:
                    lifecycleNotification.type === 'error'
                      ? '1px solid rgba(239, 68, 68, 0.35)'
                      : '1px solid rgba(16, 185, 129, 0.35)',
                  color: lifecycleNotification.type === 'error' ? '#fca5a5' : '#6ee7b7',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  {lifecycleNotification.type === 'error' ? (
                    <AlertCircle size={18} style={{ color: '#f87171' }} />
                  ) : (
                    <CheckCircle2 size={18} style={{ color: '#34d399' }} />
                  )}
                  <span>{lifecycleNotification.message}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setLifecycleNotification(null)}
                  style={{ color: 'inherit', padding: '0.2rem' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {isSimulatingError && (
              <ErrorAlert
                message="Simulated telemetry feed disconnection: Unable to poll hypervisor memory state."
                onRetry={() => setIsSimulatingError(false)}
              />
            )}

            {liveLoading ? (
              <LoadingSpinner label="Loading live data from the backend API…" />
            ) : liveError ? (
              <ErrorAlert message={liveError} onRetry={() => live.connect()} />
            ) : isSimulatingLoading ? (
              <LoadingSpinner label="Synchronizing simulated VM snapshots from virtual storage bus..." />
            ) : (
              <>
                {currentView === 'dashboard' && (
                  <DashboardOverview
                    vms={effectiveVms}
                    snapshots={effectiveSnapshots}
                    auditEvents={effectiveAuditEvents}
                    drMetrics={effectiveMetrics}
                    onSelectVM={setSelectedVM}
                    onNavigate={(view) => setCurrentView(view)}
                    onStartVM={handleStartVM}
                    onStopVM={handleStopVM}
                    onRestartVM={handleRestartVM}
                    onDeleteVMClick={setVmToDelete}
                    onCreateVMClick={() => setIsCreateModalOpen(true)}
                  />
                )}

                {currentView === 'vms' && (
                  <VMInventoryTable
                    vms={effectiveVms}
                    onSelectVM={setSelectedVM}
                    onStartVM={handleStartVM}
                    onStopVM={handleStopVM}
                    onRestartVM={handleRestartVM}
                    onDeleteVMClick={setVmToDelete}
                    onCreateVMClick={() => setIsCreateModalOpen(true)}
                  />
                )}

                {currentView === 'snapshots' && (
                  <SnapshotHistorySection
                    snapshots={effectiveSnapshots}
                    onTakeSnapshotClick={isLive ? () => setIsTakeSnapshotOpen(true) : undefined}
                    onRestoreSnapshot={isLive ? openRestoreDialog : undefined}
                    onDeleteSnapshot={isLive ? setSnapshotToDelete : undefined}
                  />
                )}

                {currentView === 'dr-metrics' && (
                  <>
                    {isLive && (
                      <RecoveryConsole
                        vms={effectiveVms}
                        snapshots={effectiveSnapshots}
                        failures={live.failures}
                        mutating={live.mutating}
                        onInjectFailure={async (vmId, scenario) => {
                          const event = await live.injectFailure(vmId, scenario);
                          notifyUser('success', `Failure '${event.scenario}' injected into ${event.vm_name}.`);
                          return event;
                        }}
                        onExecuteRecovery={async (args) => {
                          const res = await live.executeRecovery(args);
                          notifyUser(
                            res.attempt.status === 'succeeded' ? 'success' : 'error',
                            `Recovery ${res.attempt.status}: ${res.vm.name} (${res.current_state_before} → ${res.target_state}).`
                          );
                          return res;
                        }}
                      />
                    )}
                    <DRMetricsSection
                      metrics={effectiveMetrics}
                      recoveryAttempts={effectiveRecoveryAttempts}
                    />
                  </>
                )}

                {currentView === 'activity' && (
                  <RecentActivityPanel events={effectiveAuditEvents} />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* VM Detail Inspector Dialog */}
      <VMDetailsModal
        vm={selectedVM}
        isOpen={Boolean(selectedVM)}
        onClose={() => setSelectedVM(null)}
        onStartVM={handleStartVM}
        onStopVM={handleStopVM}
        onRestartVM={handleRestartVM}
      />

      {/* Create VM Modal Dialog */}
      <CreateVMModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateVM}
      />

      {/* Delete VM Confirmation Dialog */}
      <DeleteConfirmModal
        vm={vmToDelete}
        isOpen={Boolean(vmToDelete)}
        onClose={() => setVmToDelete(null)}
        onConfirm={handleDeleteVM}
      />

      {/* Live-only: Take Snapshot Dialog */}
      {isLive && (
        <TakeSnapshotModal
          isOpen={isTakeSnapshotOpen}
          vms={effectiveVms}
          vmName=""
          onClose={() => setIsTakeSnapshotOpen(false)}
          onSubmit={handleTakeSnapshot}
        />
      )}

      {/* Live-only: Restore Confirmation Dialog */}
      {isLive && (
        <RestoreConfirmModal
          snapshot={snapshotToRestore}
          currentPowerState={restoreCurrentPower}
          diff={restoreDiff}
          diffLoading={restoreDiffLoading}
          isOpen={Boolean(snapshotToRestore)}
          onClose={() => {
            setSnapshotToRestore(null);
            setRestoreDiff(null);
          }}
          onConfirm={handleRestoreSnapshot}
        />
      )}

      {/* Live-only: Delete Snapshot Confirmation Dialog */}
      {isLive && (
        <ConfirmModal
          isOpen={Boolean(snapshotToDelete)}
          title="Confirm Snapshot Deletion"
          message={
            <span>
              Delete backend snapshot <strong>{snapshotToDelete?.name}</strong> for VM{' '}
              <strong>{snapshotToDelete?.vmName}</strong>? This removes the frozen point-in-time
              image and it can no longer be used for restores.
            </span>
          }
          confirmLabel="Delete Snapshot"
          onClose={() => setSnapshotToDelete(null)}
          onConfirm={handleDeleteSnapshot}
        />
      )}
    </div>
  );
};

export default App;
