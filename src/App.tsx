import React, { useState, useRef } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { NavView, VirtualMachine } from './types';
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
import { RecentActivityPanel } from './components/audit/RecentActivityPanel';
import { VMDetailsModal } from './components/vms/VMDetailsModal';
import { CreateVMModal } from './components/vms/CreateVMModal';
import { DeleteConfirmModal } from './components/vms/DeleteConfirmModal';
import { LoadingSpinner, ErrorAlert } from './components/common/FeedbackStates';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<NavView>('dashboard');
  const [selectedVM, setSelectedVM] = useState<VirtualMachine | null>(null);

  // Modal dialog states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [vmToDelete, setVmToDelete] = useState<VirtualMachine | null>(null);

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

  // Lifecycle Operations Handlers
  const handleStartVM = (id: string) => {
    try {
      const vm = engineRef.current.startVM(id);
      syncStateFromEngine();
      notifyUser('success', `Simulated VM '${vm.name}' booted successfully.`);
    } catch (err: unknown) {
      const message = err instanceof VMLifecycleError || err instanceof Error ? err.message : 'Failed to start VM';
      notifyUser('error', message);
    }
  };

  const handleStopVM = (id: string) => {
    try {
      const vm = engineRef.current.stopVM(id);
      syncStateFromEngine();
      notifyUser('success', `Simulated VM '${vm.name}' halted.`);
    } catch (err: unknown) {
      const message = err instanceof VMLifecycleError || err instanceof Error ? err.message : 'Failed to stop VM';
      notifyUser('error', message);
    }
  };

  const handleRestartVM = (id: string) => {
    try {
      const vm = engineRef.current.restartVM(id);
      syncStateFromEngine();
      notifyUser('success', `Simulated VM '${vm.name}' reboot sequence completed.`);
    } catch (err: unknown) {
      const message = err instanceof VMLifecycleError || err instanceof Error ? err.message : 'Failed to restart VM';
      notifyUser('error', message);
    }
  };

  const handleCreateVM = (options: CreateVMOptions) => {
    const newVM = engineRef.current.createVM(options);
    syncStateFromEngine();
    notifyUser('success', `Created simulated VM '${newVM.name}' (${newVM.os}).`);
  };

  const handleDeleteVM = (vmId: string, confirmationName: string) => {
    engineRef.current.deleteVM(vmId, confirmationName);
    syncStateFromEngine();
    if (selectedVM?.id === vmId) {
      setSelectedVM(null);
    }
    setVmToDelete(null);
    notifyUser('success', `Simulated VM '${confirmationName}' successfully deleted.`);
  };

  return (
    <div className="app-shell" data-testid="app-shell">
      {/* Persistent Simulator Disclaimer Header */}
      <SimulatorBanner />

      <div className="app-body">
        {/* Navigation Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          vmCount={vms.length}
          snapshotCount={snapshots.length}
          activityCount={auditEvents.length}
        />

        {/* Main Content Viewport */}
        <div className="main-wrapper">
          <Header
            currentView={currentView}
            isSimulatingLoading={isSimulatingLoading}
            isSimulatingError={isSimulatingError}
            onSimulateLoadingToggle={() => setIsSimulatingLoading((prev) => !prev)}
            onSimulateErrorToggle={() => setIsSimulatingError((prev) => !prev)}
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

            {isSimulatingLoading ? (
              <LoadingSpinner label="Synchronizing simulated VM snapshots from virtual storage bus..." />
            ) : (
              <>
                {currentView === 'dashboard' && (
                  <DashboardOverview
                    vms={vms}
                    snapshots={snapshots}
                    auditEvents={auditEvents}
                    drMetrics={drMetrics}
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
                    vms={vms}
                    onSelectVM={setSelectedVM}
                    onStartVM={handleStartVM}
                    onStopVM={handleStopVM}
                    onRestartVM={handleRestartVM}
                    onDeleteVMClick={setVmToDelete}
                    onCreateVMClick={() => setIsCreateModalOpen(true)}
                  />
                )}

                {currentView === 'snapshots' && (
                  <SnapshotHistorySection snapshots={snapshots} />
                )}

                {currentView === 'dr-metrics' && (
                  <DRMetricsSection
                    metrics={drMetrics}
                    recoveryAttempts={recoveryAttempts}
                  />
                )}

                {currentView === 'activity' && (
                  <RecentActivityPanel events={auditEvents} />
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
    </div>
  );
};

export default App;
