import React, { useState } from 'react';
import { AlertTriangle, RotateCcw, AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Snapshot } from '../../types';
import { BackendSnapshotDiff } from '../../api/dto';

interface RestoreConfirmModalProps {
  snapshot: Snapshot | null;
  currentPowerState: string;
  diff: BackendSnapshotDiff | null;
  diffLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Destructive-operation guard for snapshot restore: shows current vs target
 * state plus the backend diff, and requires an explicit acknowledgement
 * checkbox before the restore can be submitted.
 */
export const RestoreConfirmModal: React.FC<RestoreConfirmModalProps> = ({
  snapshot,
  currentPowerState,
  diff,
  diffLoading,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!snapshot) return null;

  const handleClose = () => {
    setAcknowledged(false);
    setError(null);
    setSubmitting(false);
    onClose();
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acknowledged) {
      setError('Please acknowledge the restore impact before continuing.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to restore snapshot.');
    } finally {
      setSubmitting(false);
    }
  };

  const targetPower = diff?.power_state_diff.snapshot ?? 'unknown';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Confirm Snapshot Restore`} maxWidth="560px">
      <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.85rem 1rem',
            borderRadius: '6px',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#fcd34d',
            fontSize: '0.825rem',
          }}
        >
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
              Roll back <strong>{snapshot.vmName}</strong> to snapshot <strong>{snapshot.name}</strong>?
            </span>
            The VM&apos;s current simulated state will be replaced by the frozen snapshot image.
            Snapshot history is preserved.
          </div>
        </div>

        <div
          data-testid="restore-state-compare"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.725rem', marginBottom: '0.25rem' }}>
              CURRENT STATE
            </div>
            <code data-testid="restore-current-state" style={{ fontFamily: 'var(--font-mono)', color: '#f87171' }}>
              {currentPowerState}
            </code>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.75rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.725rem', marginBottom: '0.25rem' }}>
              TARGET SNAPSHOT STATE
            </div>
            <code data-testid="restore-target-state" style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>
              {targetPower}
            </code>
          </div>
        </div>

        {diffLoading ? (
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Comparing snapshot against live state…
          </div>
        ) : diff ? (
          <div data-testid="restore-diff-summary" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            {diff.has_any_differences ? (
              <span>
                Drift detected — power:{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>
                  {diff.power_state_diff.changed ? 'changed' : 'same'}
                </code>
                {', '}hardware:{' '}
                <code style={{ fontFamily: 'var(--font-mono)' }}>
                  {diff.hardware_diff.has_changes ? 'changed' : 'same'}
                </code>
                .
              </span>
            ) : (
              <span>No drift: live state already matches this snapshot.</span>
            )}
          </div>
        ) : null}

        {error && (
          <div
            data-testid="restore-confirm-error"
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => {
              setAcknowledged(e.target.checked);
              if (error) setError(null);
            }}
            data-testid="restore-acknowledge-checkbox"
            style={{ marginTop: '0.2rem', accentColor: 'var(--color-brand)' }}
          />
          <span>
            I understand this replaces the live simulated state of <strong>{snapshot.vmName}</strong> and
            I want to proceed with the restoration.
          </span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!acknowledged || submitting}
            data-testid="restore-confirm-submit-btn"
            style={{ opacity: acknowledged && !submitting ? 1 : 0.5 }}
          >
            <RotateCcw size={14} />
            <span>{submitting ? 'Restoring…' : 'Restore Snapshot'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
