import React, { useState } from 'react';
import {
  Server,
  HardDrive,
  FileCode,
  Network,
  Cpu,
  Clock,
  ShieldAlert,
  Play,
  Square,
  RotateCw,
  Info,
} from 'lucide-react';
import { VirtualMachine } from '../../types';
import { Modal } from '../common/Modal';
import { StatusBadge, EnvBadge } from '../common/Badge';

interface VMDetailsModalProps {
  vm: VirtualMachine | null;
  isOpen: boolean;
  onClose: () => void;
  onStartVM?: (id: string) => void;
  onStopVM?: (id: string) => void;
  onRestartVM?: (id: string) => void;
  /** When true, the VM came from the backend API, which reports power +
   * hardware only. Guest internals below are then explicitly not reported
   * rather than silently empty. Demo mode leaves this unset. */
  liveBackend?: boolean;
}

export const VMDetailsModal: React.FC<VMDetailsModalProps> = ({
  vm,
  isOpen,
  onClose,
  onStartVM,
  onStopVM,
  onRestartVM,
  liveBackend,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'processes' | 'filesystem' | 'network'>('overview');

  if (!vm) return null;

  const ramUsedPercent = Math.min(
    100,
    Math.round((vm.currentState.memoryUsageMb / vm.hardware.memoryMb) * 100)
  );

  const formatUptime = (seconds: number) => {
    if (seconds === 0) return '0s (Halted)';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days > 0 ? `${days}d ` : ''}${hours}h ${mins}m`;
  };

  const isRunning = vm.currentState.powerState === 'running';
  const isStopped = vm.currentState.powerState === 'stopped';
  const canStart = isStopped || vm.currentState.powerState === 'paused';
  const canStop = isRunning || vm.currentState.powerState === 'paused' || vm.currentState.powerState === 'crashed' || vm.currentState.powerState === 'corrupted';
  const canRestart = isRunning;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Simulated VM Inspector: ${vm.name}`}
      maxWidth="760px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            SIM-ID: {vm.id}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose} data-testid="vm-details-close-btn">
            Close Inspector
          </button>
        </div>
      }
    >
      {/* Top Banner with simulated state & power controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          background: 'rgba(0, 0, 0, 0.35)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Server size={22} style={{ color: 'var(--color-brand)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{vm.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {vm.currentState.osName}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Quick power control toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '6px' }}>
            {onStartVM && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title={canStart ? 'Start simulated VM' : 'Cannot start in current state'}
                disabled={!canStart}
                onClick={() => onStartVM(vm.id)}
                data-testid="inspector-start-btn"
                style={{ color: canStart ? '#34d399' : 'var(--text-muted)', padding: '0.25rem 0.4rem' }}
              >
                <Play size={13} />
              </button>
            )}
            {onStopVM && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title={canStop ? 'Stop simulated VM' : 'Cannot stop in current state'}
                disabled={!canStop}
                onClick={() => onStopVM(vm.id)}
                data-testid="inspector-stop-btn"
                style={{ color: canStop ? '#f87171' : 'var(--text-muted)', padding: '0.25rem 0.4rem' }}
              >
                <Square size={13} />
              </button>
            )}
            {onRestartVM && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title={canRestart ? 'Restart simulated VM' : 'Cannot restart in current state'}
                disabled={!canRestart}
                onClick={() => onRestartVM(vm.id)}
                data-testid="inspector-restart-btn"
                style={{ color: canRestart ? '#38bdf8' : 'var(--text-muted)', padding: '0.25rem 0.4rem' }}
              >
                <RotateCw size={13} />
              </button>
            )}
          </div>

          <EnvBadge environment={vm.environment} />
          <StatusBadge status={vm.currentState.powerState} />
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '0.5rem',
          paddingBottom: '0.25rem',
        }}
      >
        {(['overview', 'processes', 'filesystem', 'network'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className="btn btn-ghost btn-sm"
            style={{
              textTransform: 'capitalize',
              color: activeTab === tab ? 'var(--color-brand)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab ? '2px solid var(--color-brand)' : '2px solid transparent',
              borderRadius: 0,
              fontWeight: activeTab === tab ? 600 : 500,
            }}
            onClick={() => setActiveTab(tab)}
            data-testid={`vm-tab-${tab}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="spec-grid">
            <div className="spec-item">
              <div className="spec-label">Assigned vCPUs</div>
              <div className="spec-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Cpu size={16} /> {vm.hardware.cpuCores} Cores
              </div>
            </div>
            <div className="spec-item">
              <div className="spec-label">Provisioned RAM</div>
              <div className="spec-value">
                {Math.round(vm.hardware.memoryMb / 1024)} GB ({vm.hardware.memoryMb} MB)
              </div>
            </div>
            <div className="spec-item">
              <div className="spec-label">Simulated Disk Size</div>
              <div className="spec-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <HardDrive size={16} /> {vm.hardware.diskSizeGb} GB Virtual Disk
              </div>
            </div>
            <div className="spec-item">
              <div className="spec-label">Simulated Guest Uptime</div>
              <div className="spec-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={16} /> {formatUptime(vm.currentState.simulatedUptimeSeconds)}
              </div>
            </div>
          </div>

          {/* Utilization Bars */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div className="progress-bar-container">
              <div className="progress-header">
                <span>Simulated CPU Utilization</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{vm.currentState.cpuUsagePercent}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${vm.currentState.cpuUsagePercent}%`,
                    backgroundColor:
                      vm.currentState.cpuUsagePercent > 80
                        ? 'var(--color-danger)'
                        : 'var(--color-brand)',
                  }}
                />
              </div>
            </div>

            <div className="progress-bar-container">
              <div className="progress-header">
                <span>Simulated Memory Consumption</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {Math.round(vm.currentState.memoryUsageMb / 1024)}GB / {Math.round(vm.hardware.memoryMb / 1024)}GB ({ramUsedPercent}%)
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${ramUsedPercent}%`,
                    backgroundColor:
                      ramUsedPercent > 85 ? 'var(--color-danger)' : 'var(--color-purple)',
                  }}
                />
              </div>
            </div>
          </div>

          {vm.currentState.kernelStatus !== 'ok' && (
            <div className="error-banner" style={{ marginTop: '0.5rem' }}>
              <ShieldAlert size={18} />
              <div>
                <strong>Kernel Anomaly Detected: </strong>
                Simulated guest kernel state is <code>{vm.currentState.kernelStatus}</code>. Restoration or reboot recommended.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Processes */}
      {activeTab === 'processes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {liveBackend && (
            <div data-testid="live-guest-data-notice" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#7dd3fc', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '0.6rem 0.8rem' }}>
              <Info size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Live backend data: the API reports power state and hardware only — guest processes are not simulated server-side and are therefore not listed here.</span>
            </div>
          )}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Simulated guest OS processes currently executing in synthetic user-space:
          </div>
          {vm.currentState.processes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No active processes (VM is halted or powered off).
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>PID</th>
                    <th>Process Name</th>
                    <th>CPU %</th>
                    <th>Memory</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.currentState.processes.map((proc) => (
                    <tr key={proc.pid}>
                      <td>
                        <code style={{ fontFamily: 'var(--font-mono)' }}>{proc.pid}</code>
                      </td>
                      <td style={{ fontWeight: 600 }}>{proc.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{proc.cpuPercent}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{proc.memoryMb} MB</td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            background:
                              proc.status === 'healthy'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(239, 68, 68, 0.15)',
                            color: proc.status === 'healthy' ? '#34d399' : '#f87171',
                          }}
                        >
                          {proc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Filesystem */}
      {activeTab === 'filesystem' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {liveBackend && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#7dd3fc', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '0.6rem 0.8rem' }}>
              <Info size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Live backend data: filesystem inodes are not tracked server-side — snapshot restores are verified from the frozen hardware/power image instead.</span>
            </div>
          )}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Tracked virtual filesystem inodes & SHA-256 hashes used to verify snapshot restoration fidelity:
          </div>
          <div className="table-responsive">
            <table className="data-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Size</th>
                  <th>SHA-256 Hash</th>
                  <th>Simulated Modified</th>
                </tr>
              </thead>
              <tbody>
                {vm.currentState.filesystem.map((f, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <FileCode size={13} style={{ color: 'var(--color-brand)' }} />
                        <code style={{ fontFamily: 'var(--font-mono)' }}>{f.path}</code>
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(f.sizeKb / 1024)} MB</td>
                    <td>
                      <code
                        style={{
                          fontSize: '0.7rem',
                          fontFamily: 'var(--font-mono)',
                          color: f.checksum.includes('corrupted') ? '#f87171' : 'var(--text-secondary)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '4px',
                        }}
                      >
                        {f.checksum.slice(0, 24)}...
                      </code>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {new Date(f.lastModifiedSimulated).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Network */}
      {activeTab === 'network' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {liveBackend && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#7dd3fc', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '0.6rem 0.8rem' }}>
              <Info size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Live backend data: no virtual network is allocated server-side — link state is derived from power state only.</span>
            </div>
          )}
          <div className="spec-grid">
            <div className="spec-item">
              <div className="spec-label">Assigned Simulated IP</div>
              <div className="spec-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Network size={16} /> {vm.currentState.network.ipAddress}
              </div>
            </div>
            <div className="spec-item">
              <div className="spec-label">Link Status</div>
              <div className="spec-value">
                <span
                  style={{
                    color: vm.currentState.network.connected ? '#34d399' : '#f87171',
                  }}
                >
                  {vm.currentState.network.connected ? '● UP (10 Gbps VirtIO)' : '○ DOWN (Disconnected)'}
                </span>
              </div>
            </div>
            <div className="spec-item">
              <div className="spec-label">Packets Transmitted (TX)</div>
              <div className="spec-value">
                {vm.currentState.network.txPackets.toLocaleString()}
              </div>
            </div>
            <div className="spec-item">
              <div className="spec-label">Packets Received (RX)</div>
              <div className="spec-value">
                {vm.currentState.network.rxPackets.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
