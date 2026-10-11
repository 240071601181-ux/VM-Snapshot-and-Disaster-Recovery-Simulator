import React, { useState } from 'react';
import { Server, Cpu, Layers, HardDrive, AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { CreateVMOptions } from '../../engine/VMLifecycleEngine';

interface CreateVMModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (options: CreateVMOptions) => void;
}

const OS_OPTIONS = [
  'Ubuntu 24.04 LTS',
  'Debian 12 Bookworm',
  'Alpine Linux 3.20',
  'CentOS Stream 9',
  'Windows Server 2022',
];

export const CreateVMModal: React.FC<CreateVMModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [os, setOs] = useState(OS_OPTIONS[0]);
  const [environment, setEnvironment] = useState<'production' | 'staging' | 'development'>('production');
  const [cpuCores, setCpuCores] = useState(4);
  const [memoryGb, setMemoryGb] = useState(8);
  const [diskSizeGb, setDiskSizeGb] = useState(100);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setDescription('');
    setOs(OS_OPTIONS[0]);
    setEnvironment('production');
    setCpuCores(4);
    setMemoryGb(8);
    setDiskSizeGb(100);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a simulated virtual machine name.');
      return;
    }

    try {
      onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        os,
        environment,
        hardware: {
          cpuCores,
          memoryMb: memoryGb * 1024,
          diskSizeGb,
        },
      });
      handleClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create virtual machine');
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Simulated Virtual Machine" maxWidth="620px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {error && (
          <div
            data-testid="create-vm-error"
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label
              htmlFor="vm-name-input"
              style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
            >
              VM Name *
            </label>
            <input
              id="vm-name-input"
              type="text"
              placeholder="e.g. app-cluster-node-03"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              data-testid="create-vm-name-input"
              required
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
              htmlFor="vm-env-select"
              style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
            >
              Environment
            </label>
            <select
              id="vm-env-select"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as 'production' | 'staging' | 'development')}
              data-testid="create-vm-env-select"
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
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="vm-os-select"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
          >
            Simulated Operating System
          </label>
          <select
            id="vm-os-select"
            value={os}
            onChange={(e) => setOs(e.target.value)}
            data-testid="create-vm-os-select"
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
            {OS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="vm-desc-input"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
          >
            Description (Optional)
          </label>
          <input
            id="vm-desc-input"
            type="text"
            placeholder="Simulated workload description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="create-vm-desc-input"
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

        {/* Hardware Configuration Sliders */}
        <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            Simulated Hardware Allocation
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Cpu size={12} /> vCPU Cores
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)' }}>{cpuCores}c</span>
              </div>
              <input
                type="range"
                min={1}
                max={32}
                value={cpuCores}
                onChange={(e) => setCpuCores(Number(e.target.value))}
                data-testid="create-vm-cpu-slider"
                style={{ width: '100%', accentColor: 'var(--color-brand)' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Layers size={12} /> Memory
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)' }}>{memoryGb} GB</span>
              </div>
              <input
                type="range"
                min={1}
                max={64}
                value={memoryGb}
                onChange={(e) => setMemoryGb(Number(e.target.value))}
                data-testid="create-vm-ram-slider"
                style={{ width: '100%', accentColor: 'var(--color-brand)' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <HardDrive size={12} /> Virtual Disk
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)' }}>{diskSizeGb} GB</span>
              </div>
              <input
                type="range"
                min={20}
                max={1000}
                step={10}
                value={diskSizeGb}
                onChange={(e) => setDiskSizeGb(Number(e.target.value))}
                data-testid="create-vm-disk-slider"
                style={{ width: '100%', accentColor: 'var(--color-brand)' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" data-testid="create-vm-submit-btn">
            <Server size={14} />
            <span>Create Virtual Machine</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
