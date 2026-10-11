import React from 'react';
import {
  Server,
  Camera,
  ShieldCheck,
  AlertOctagon,
  ArrowRight,
} from 'lucide-react';
import {
  VirtualMachine,
  Snapshot,
  AuditEvent,
  DRMetricsSummary,
  NavView,
} from '../../types';
import { MetricCard } from '../common/Card';
import { VMInventoryTable } from '../vms/VMInventoryTable';
import { RecentActivityPanel } from '../audit/RecentActivityPanel';

interface DashboardOverviewProps {
  vms: VirtualMachine[];
  snapshots: Snapshot[];
  auditEvents: AuditEvent[];
  drMetrics: DRMetricsSummary;
  onSelectVM: (vm: VirtualMachine) => void;
  onNavigate: (view: NavView) => void;
  onStartVM?: (id: string) => void;
  onStopVM?: (id: string) => void;
  onRestartVM?: (id: string) => void;
  onDeleteVMClick?: (vm: VirtualMachine) => void;
  onCreateVMClick?: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  vms,
  snapshots,
  auditEvents,
  drMetrics,
  onSelectVM,
  onNavigate,
  onStartVM,
  onStopVM,
  onRestartVM,
  onDeleteVMClick,
  onCreateVMClick,
}) => {
  const runningVms = vms.filter((v) => v.currentState.powerState === 'running').length;
  const unhealthyVms = vms.filter(
    (v) => v.currentState.powerState === 'crashed' || v.currentState.powerState === 'corrupted'
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} data-testid="dashboard-overview">
      {/* Overview Metric Cards */}
      <div className="metrics-grid">
        <MetricCard
          title="Virtual Machines"
          value={vms.length}
          subtext={`${runningVms} Active / ${unhealthyVms} Degraded`}
          icon={<Server size={18} style={{ color: 'var(--color-brand)' }} />}
          testId="metric-total-vms"
        />

        <MetricCard
          title="Captured Snapshots"
          value={snapshots.length}
          subtext="Point-in-time recovery images"
          icon={<Camera size={18} style={{ color: '#38bdf8' }} />}
          testId="metric-total-snapshots"
        />

        <MetricCard
          title="DR Recovery Rate"
          value={`${drMetrics.successRatePercent}%`}
          subtext={`Mean RTO: ${Math.round(drMetrics.meanTimeToRecoverySeconds / 60)}m ${drMetrics.meanTimeToRecoverySeconds % 60}s`}
          icon={<ShieldCheck size={18} style={{ color: '#34d399' }} />}
          testId="metric-recovery-rate"
        />

        <MetricCard
          title="Simulated Anomalies"
          value={unhealthyVms}
          subtext={unhealthyVms > 0 ? 'Requires snapshot restoration' : 'All systems nominal'}
          icon={<AlertOctagon size={18} style={{ color: unhealthyVms > 0 ? '#f87171' : '#34d399' }} />}
          testId="metric-anomalies"
        />
      </div>

      {/* Main Grid: VM Table + Recent Activity Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.2fr)', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <VMInventoryTable
            vms={vms}
            onSelectVM={onSelectVM}
            onStartVM={onStartVM}
            onStopVM={onStopVM}
            onRestartVM={onRestartVM}
            onDeleteVMClick={onDeleteVMClick}
            onCreateVMClick={onCreateVMClick}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate('vms')}
              style={{ color: 'var(--color-brand)' }}
              data-testid="goto-vms-btn"
            >
              <span>Manage all virtual machines</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <RecentActivityPanel events={auditEvents} maxItems={5} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate('activity')}
              style={{ color: 'var(--color-brand)' }}
              data-testid="goto-activity-btn"
            >
              <span>View full audit timeline</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
