import React from 'react';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  Gauge,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { DRMetricsSummary, RecoveryAttempt } from '../../types';
import { MetricCard } from '../common/Card';

interface DRMetricsSectionProps {
  metrics: DRMetricsSummary;
  recoveryAttempts: RecoveryAttempt[];
}

export const DRMetricsSection: React.FC<DRMetricsSectionProps> = ({
  metrics,
  recoveryAttempts,
}) => {
  const formatSeconds = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}m ${remainder > 0 ? `${remainder}s` : ''}`;
  };

  const isRtoCompliant = metrics.meanTimeToRecoverySeconds <= metrics.targetRtoSeconds;
  const isRpoCompliant = metrics.averageDataLossWindowSeconds <= metrics.targetRpoSeconds;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} data-testid="dr-metrics-section">
      {/* SLA Gauges & Cards */}
      <div className="metrics-grid">
        <MetricCard
          title="Recovery Success Rate"
          value={`${metrics.successRatePercent}%`}
          subtext={`${metrics.successfulRecoveries} succeeded / ${metrics.failedRecoveries} failed drills`}
          icon={<Gauge size={18} style={{ color: '#34d399' }} />}
          testId="metric-success-rate"
        />

        <MetricCard
          title="Actual MTTR (Mean Recovery Time)"
          value={formatSeconds(metrics.meanTimeToRecoverySeconds)}
          unit={`/ SLA: ${formatSeconds(metrics.targetRtoSeconds)}`}
          subtext={isRtoCompliant ? '✓ Within Recovery Time SLA' : '⚠ Exceeds Recovery SLA Target'}
          icon={<Clock size={18} style={{ color: isRtoCompliant ? '#34d399' : '#f87171' }} />}
          testId="metric-mttr"
        />

        <MetricCard
          title="Simulated RPO (Data Loss Window)"
          value={formatSeconds(metrics.averageDataLossWindowSeconds)}
          unit={`/ Target: ${formatSeconds(metrics.targetRpoSeconds)}`}
          subtext={isRpoCompliant ? '✓ Within Target RPO' : '⚠ Data loss window threshold warning'}
          icon={<AlertTriangle size={18} style={{ color: isRpoCompliant ? '#38bdf8' : '#fbbf24' }} />}
          testId="metric-rpo"
        />

        <MetricCard
          title="Total DR Drills Tested"
          value={metrics.totalRecoveryAttempts}
          subtext={`Last verified drill: ${new Date(metrics.lastTestedRecoveryDate || '').toLocaleDateString()}`}
          icon={<RotateCcw size={18} style={{ color: '#a855f7' }} />}
          testId="metric-dr-attempts"
        />
      </div>

      {/* Recovery Drill Execution History Table */}
      <div className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <ShieldCheck size={18} style={{ color: 'var(--color-brand)' }} />
              <span>Simulated Disaster Recovery Attempt Log</span>
            </h2>
            <div className="panel-subtitle">
              Audit trail of point-in-time recovery validations and simulated data verification
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table" data-testid="recovery-attempts-table">
            <thead>
              <tr>
                <th>Recovery Drill ID</th>
                <th>Target VM</th>
                <th>Target Snapshot</th>
                <th>Actual RTO</th>
                <th>Simulated RPO</th>
                <th>SHA-256 Hash Verified</th>
                <th style={{ textAlign: 'right' }}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {recoveryAttempts.map((attempt) => (
                <tr key={attempt.id} data-testid={`recovery-row-${attempt.id}`}>
                  <td>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.775rem' }}>
                      {attempt.id}
                    </code>
                  </td>
                  <td style={{ fontWeight: 600 }}>{attempt.vmName}</td>
                  <td>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-brand)' }}>
                      {attempt.targetSnapshotName}
                    </div>
                  </td>
                  <td>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {attempt.calculatedRtoSeconds > 0 ? formatSeconds(attempt.calculatedRtoSeconds) : 'In Progress'}
                    </code>
                  </td>
                  <td>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {formatSeconds(attempt.calculatedRpoSeconds)}
                    </code>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        color: attempt.restoredChecksumMatch ? '#34d399' : '#94a3b8',
                      }}
                    >
                      {attempt.restoredChecksumMatch ? (
                        <>
                          <CheckCircle size={14} /> Match 100%
                        </>
                      ) : (
                        'Pending Verification'
                      )}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.725rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background:
                          attempt.status === 'succeeded'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : attempt.status === 'in_progress'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        color:
                          attempt.status === 'succeeded'
                            ? '#34d399'
                            : attempt.status === 'in_progress'
                            ? '#fbbf24'
                            : '#f87171',
                      }}
                    >
                      {attempt.status === 'succeeded' && <CheckCircle size={12} />}
                      {attempt.status === 'failed' && <XCircle size={12} />}
                      {attempt.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
