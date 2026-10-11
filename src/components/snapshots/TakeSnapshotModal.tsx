import React, { useEffect, useState } from 'react';
import { Camera, AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { VirtualMachine } from '../../types';

interface TakeSnapshotModalProps {
  isOpen: boolean;
  vms: VirtualMachine[];
  initialVmId?: string | null;
  vmName: string;
  onClose: () => void;
  onSubmit: (vmId: string, name: string, description: string) => void | Promise<void>;
}

export const TakeSnapshotModal: React.FC<TakeSnapshotModalProps> = ({
  isOpen,
  vms,
  initialVmId,
  vmName,
  onClose,
  onSubmit,
}) => {
  const [vmId, setVmId] = useState(initialVmId ?? vms[0]?.id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The VM list loads asynchronously in Live mode — default the selection
  // once options arrive instead of keeping a stale empty value.
  useEffect(() => {
    if (isOpen && !vmId && vms.length > 0) {
      setVmId(initialVmId ?? vms[0].id);
    }
  }, [isOpen, vms, initialVmId, vmId]);

  const handleClose = () => {
    setVmId(initialVmId ?? vms[0]?.id ?? '');
    setName('');
    setDescription('');
    setError(null);
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vmId) {
      setError('Select a simulated VM first.');
      return;
    }
    if (!name.trim()) {
      setError('Please provide a snapshot name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(vmId, name.trim(), description.trim());
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create snapshot.');
    } finally {
      setSubmitting(false);
    }
  };

  const heading = vmName || vms.find((v) => v.id === vmId)?.name || 'Snapshot';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Capture Snapshot — ${heading}`} maxWidth="520px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div
            data-testid="take-snapshot-error"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {vms.length > 1 && (
          <div>
            <label
              htmlFor="snapshot-vm-select"
              style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
            >
              Target VM *
            </label>
            <select
              id="snapshot-vm-select"
              value={vmId}
              onChange={(e) => setVmId(e.target.value)}
              data-testid="take-snapshot-vm-select"
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.5rem 0.75rem',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            >
              {vms.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.currentState.powerState})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label
            htmlFor="snapshot-name-input"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
          >
            Snapshot Name *
          </label>
          <input
            id="snapshot-name-input"
            type="text"
            placeholder="e.g. pre-patch-baseline"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            data-testid="take-snapshot-name-input"
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="snapshot-desc-input"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
          >
            Description (Optional)
          </label>
          <input
            id="snapshot-desc-input"
            type="text"
            placeholder="Why is this point-in-time important?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="take-snapshot-desc-input"
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            data-testid="take-snapshot-submit-btn"
          >
            <Camera size={14} />
            <span>{submitting ? 'Capturing…' : 'Capture Snapshot'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
