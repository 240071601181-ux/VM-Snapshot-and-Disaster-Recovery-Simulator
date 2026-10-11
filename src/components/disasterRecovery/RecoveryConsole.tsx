import React, { useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck, Zap, RotateCcw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Snapshot, VirtualMachine } from '../../types';
import { FailureScenario } from '../../api/endpoints';
import { BackendFailureEvent, BackendRecoveryExecuteResult } from '../../api/dto';

interface RecoveryConsoleProps {
  vms: VirtualMachine[];
  snapshots: Snapshot[];
  failures: BackendFailureEvent[];
  mutating: boolean;
  onInjectFailure: (vmId: string, scenario: FailureScenario) => Promise<BackendFailureEvent>;
  onExecuteRecovery: (args: {
    vmId: string;
    snapshotId: string;
    healthCheck?: 'auto' | 'pass' | 'fail';
  }) => Promise<BackendRecoveryExecuteResult>;
}

const SCENARIOS: { value: FailureScenario; label: string; hint: string }[] = [
  { value: 'application_crash', label: 'Application Crash', hint: 'running/paused → crashed' },
  { value: 'configuration_corruption', label: 'Config Corruption', hint: '→ corrupted' },
  { value: 'service_outage', label: 'Service Outage', hint: 'running/paused → stopped' },
  { value: 'failed_health_check', label: 'Failed Health Check', hint: 'records only' },
  { value: 'interrupted_recovery', label: 'Interrupted Recovery', hint: 'fails in-progress attempt' },
];

/**
 * Live-only DR console: failure injection + guarded recovery execution.
 * Every action hits the backend and refreshes; results shown are the actual
 * API responses, never canned messages.
 */
export const RecoveryConsole: React.FC<RecoveryConsoleProps> = ({
  vms,
  snapshots,
  failures,
  mutating,
  onInjectFailure,
  onExecuteRecovery,
}) => {
  const [vmId, setVmId] = useState('');
  const [scenario, setScenario] = useState<FailureScenario>('application_crash');
  const [snapshotId, setSnapshotId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<BackendRecoveryExecuteResult | null>(null);
  const [busy, setBusy] = useState(false);

  const vmSnapshots = useMemo(() => snapshots.filter((s) => s.vmId === vmId), [snapshots, vmId]);
  const selectedVm = vms.find((v) => v.id === vmId) ?? null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Operation failed.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const handleInject = () =>
    run(async () => {
      if (!vmId) {
        setError('Select a simulated VM first.');
        return;
      }
      const event = await onInjectFailure(vmId, scenario);
      setNotice(`Injected ${event.scenario} into ${event.vm_name} at ${event.injected_at}.`);
      setResult(null);
    });

  const handleExecute = () =>
    run(async () => {
      if (!vmId || !snapshotId) {
        setError('Select a VM and one of its snapshots first.');
        return;
      }
      if (!confirmed) {
        setError('Explicit confirmation is required before restoration.');
        return;
      }
      const res = await onExecuteRecovery({ vmId, snapshotId });
      setResult(res);
      setNotice(null);
    });

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: '0.8125rem',
    borderRadius: '6px',
    padding: '0.45rem 0.6rem',
    outline: 'none',
    minWidth: '200px',
  };

  return (
    <div className="dashboard-panel" data-testid="recovery-console">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <ShieldCheck size={18} style={{ color: 'var(--color-brand)' }} />
            <span>Live Recovery Console</span>
          </h2>
          <div className="panel-subtitle">
            Inject controlled failures and execute guarded snapshot restores against the backend API
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div data-testid="recovery-console-error" role="alert" style={{ padding: '0.65rem 0.85rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div data-testid="recovery-console-notice" style={{ padding: '0.65rem 0.85rem', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="recovery-vm-select" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Simulated VM</label>
            <select
              id="recovery-vm-select"
              value={vmId}
              onChange={(e) => {
                setVmId(e.target.value);
                setSnapshotId('');
                setResult(null);
              }}
              data-testid="recovery-vm-select"
              style={inputStyle}
            >
              <option value="">— select VM —</option>
              {vms.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.currentState.powerState})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="failure-scenario-select" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Failure Scenario</label>
            <select
              id="failure-scenario-select"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as FailureScenario)}
              data-testid="failure-scenario-select"
              style={inputStyle}
            >
              {SCENARIOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.hint}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleInject}
            disabled={busy || mutating || !vmId}
            data-testid="inject-failure-btn"
          >
            <Zap size={14} />
            <span>Inject Failure</span>
          </button>
        </div>

        {selectedVm && (
          <div data-testid="recovery-vm-state" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Selected VM state: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand)' }}>{selectedVm.currentState.powerState}</code>
            {failures.filter((f) => f.vm_id === vmId).length > 0 && (
              <span> · {failures.filter((f) => f.vm_id === vmId).length} failure event(s) recorded</span>
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="recovery-snapshot-select" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Snapshot to Restore</label>
              <select
                id="recovery-snapshot-select"
                value={snapshotId}
                onChange={(e) => {
                  setSnapshotId(e.target.value);
                  setResult(null);
                }}
                data-testid="recovery-snapshot-select"
                style={inputStyle}
              >
                <option value="">— select snapshot —</option>
                {vmSnapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                data-testid="recovery-confirm-checkbox"
                style={{ accentColor: 'var(--color-brand)' }}
              />
              <span>I confirm this restoration</span>
            </label>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleExecute}
              disabled={busy || mutating || !confirmed}
              data-testid="execute-recovery-btn"
            >
              <RotateCcw size={14} />
              <span>Execute Recovery</span>
            </button>
          </div>

          {result && (
            <div
              data-testid="recovery-result"
              style={{
                borderRadius: '6px',
                padding: '0.85rem 1rem',
                fontSize: '0.8125rem',
                background: result.attempt.status === 'succeeded' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${result.attempt.status === 'succeeded' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: 'var(--text-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                {result.attempt.status === 'succeeded' ? <CheckCircle2 size={16} color="#34d399" /> : <XCircle size={16} color="#f87171" />}
                <span data-testid="recovery-result-status">Recovery {result.attempt.status}</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span data-testid="recovery-result-states">
                  {result.current_state_before} → {result.target_state} · final: {result.vm.power_state}
                </span>
                <span data-testid="recovery-result-health">
                  Health check {result.health_check.passed ? 'passed' : 'failed'}: {result.health_check.detail}
                </span>
                <span data-testid="recovery-result-elapsed">
                  Elapsed {result.elapsed_seconds.toFixed(3)}s · attempt {result.attempt.id}
                </span>
              </div>
            </div>
          )}
        </div>

        {failures.length > 0 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={13} />
            <span data-testid="recovery-failure-count">{failures.length} injected failure event(s) visible to this console</span>
          </div>
        )}
      </div>
    </div>
  );
};
