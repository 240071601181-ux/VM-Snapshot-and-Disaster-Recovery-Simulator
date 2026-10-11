import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { VirtualMachine } from '../../types';

interface DeleteConfirmModalProps {
  vm: VirtualMachine | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (vmId: string, confirmationName: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  vm,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [typedName, setTypedName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!vm) return null;

  const isMatch = typedName.trim() === vm.name;

  const handleClose = () => {
    setTypedName('');
    setError(null);
    onClose();
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch) {
      setError(`Confirmation name must match "${vm.name}" exactly.`);
      return;
    }

    try {
      onConfirm(vm.id, typedName.trim());
      handleClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to delete virtual machine');
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Confirm Simulated VM Deletion" maxWidth="480px">
      <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '0.85rem 1rem',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
          }}
        >
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px', color: '#f87171' }} />
          <div style={{ fontSize: '0.825rem' }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
              Warning: Simulated Destruction
            </span>
            Deleting <strong>{vm.name}</strong> will purge its simulated guest configuration, virtual IP allocation, and local disk state from simulator memory.
          </div>
        </div>

        {error && (
          <div
            data-testid="delete-confirm-error"
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              fontSize: '0.8rem',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="delete-confirm-input"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.4rem',
            }}
          >
            Please type <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', fontWeight: 700 }}>{vm.name}</code> to confirm:
          </label>
          <input
            id="delete-confirm-input"
            type="text"
            placeholder={vm.name}
            value={typedName}
            onChange={(e) => {
              setTypedName(e.target.value);
              if (error) setError(null);
            }}
            data-testid="delete-confirm-input"
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={!isMatch}
            data-testid="delete-confirm-submit-btn"
            style={{
              opacity: isMatch ? 1 : 0.5,
              cursor: isMatch ? 'pointer' : 'not-allowed',
            }}
          >
            <Trash2 size={14} />
            <span>Delete Virtual Machine</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
