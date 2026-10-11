import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Eye,
  Server,
  Cpu,
  HardDrive,
  Camera,
  Layers,
  Play,
  Square,
  RotateCw,
  Trash2,
  Plus,
} from 'lucide-react';
import { VirtualMachine } from '../../types';
import { StatusBadge, EnvBadge } from '../common/Badge';
import { EmptyState } from '../common/FeedbackStates';

interface VMInventoryTableProps {
  vms: VirtualMachine[];
  onSelectVM: (vm: VirtualMachine) => void;
  onStartVM?: (id: string) => void;
  onStopVM?: (id: string) => void;
  onRestartVM?: (id: string) => void;
  onDeleteVMClick?: (vm: VirtualMachine) => void;
  onCreateVMClick?: () => void;
}

export const VMInventoryTable: React.FC<VMInventoryTableProps> = ({
  vms,
  onSelectVM,
  onStartVM,
  onStopVM,
  onRestartVM,
  onDeleteVMClick,
  onCreateVMClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterEnv, setFilterEnv] = useState<string>('all');

  const filteredVms = useMemo(() => {
    return vms.filter((vm) => {
      const matchesSearch =
        vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vm.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vm.currentState.network.ipAddress.includes(searchQuery);

      const matchesState = filterState === 'all' || vm.currentState.powerState === filterState;
      const matchesEnv = filterEnv === 'all' || vm.environment === filterEnv;

      return matchesSearch && matchesState && matchesEnv;
    });
  }, [vms, searchQuery, filterState, filterEnv]);

  return (
    <div className="dashboard-panel" data-testid="vm-inventory-section">
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="panel-title">
            <Server size={18} style={{ color: 'var(--color-brand)' }} />
            <span>Simulated Virtual Machines</span>
            <span
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.1rem 0.5rem',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
              }}
            >
              {filteredVms.length} of {vms.length}
            </span>
          </h2>
          <div className="panel-subtitle">
            Guest virtual machines running inside simulator memory space
          </div>
        </div>

        {/* Search, Filters & Create Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '0.35rem 0.65rem',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name, IP, desc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter virtual machines"
              data-testid="vm-search-input"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
                outline: 'none',
                width: '160px',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              aria-label="Filter by execution state"
              data-testid="vm-state-filter"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                borderRadius: '6px',
                padding: '0.35rem 0.5rem',
                outline: 'none',
              }}
            >
              <option value="all">All States</option>
              <option value="running">Running</option>
              <option value="paused">Paused</option>
              <option value="stopped">Stopped</option>
              <option value="crashed">Crashed</option>
              <option value="corrupted">Corrupted</option>
            </select>

            <select
              value={filterEnv}
              onChange={(e) => setFilterEnv(e.target.value)}
              aria-label="Filter by environment"
              data-testid="vm-env-filter"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                borderRadius: '6px',
                padding: '0.35rem 0.5rem',
                outline: 'none',
              }}
            >
              <option value="all">All Environments</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>

          {onCreateVMClick && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onCreateVMClick}
              data-testid="create-vm-open-btn"
            >
              <Plus size={14} />
              <span>New VM</span>
            </button>
          )}
        </div>
      </div>

      {filteredVms.length === 0 ? (
        <EmptyState
          title="No Virtual Machines Match Filter"
          description="Try modifying your search query or resetting state filters to locate your simulated instances."
          actionText="Clear Filters"
          onAction={() => {
            setSearchQuery('');
            setFilterState('all');
            setFilterEnv('all');
          }}
        />
      ) : (
        <div className="table-responsive">
          <table className="data-table" data-testid="vm-table">
            <thead>
              <tr>
                <th>VM Name</th>
                <th>Status</th>
                <th>Environment</th>
                <th>Hardware (vCPU / RAM / Disk)</th>
                <th>Simulated IP</th>
                <th>Snapshots</th>
                <th style={{ textAlign: 'right' }}>Lifecycle & Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVms.map((vm) => {
                const isRunning = vm.currentState.powerState === 'running';
                const isStopped = vm.currentState.powerState === 'stopped';
                const canStart = isStopped || vm.currentState.powerState === 'paused';
                const canStop = isRunning || vm.currentState.powerState === 'paused' || vm.currentState.powerState === 'crashed' || vm.currentState.powerState === 'corrupted';
                const canRestart = isRunning;

                return (
                  <tr
                    key={vm.id}
                    data-testid={`vm-row-${vm.id}`}
                    className="table-row-clickable"
                    onClick={() => onSelectVM(vm)}
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {vm.name}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            maxWidth: '220px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {vm.description}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={vm.currentState.powerState} />
                    </td>
                    <td>
                      <EnvBadge environment={vm.environment} />
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          fontSize: '0.8rem',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <span title="vCPU Cores" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Cpu size={13} style={{ color: 'var(--text-muted)' }} /> {vm.hardware.cpuCores}c
                        </span>
                        <span title="Simulated RAM" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Layers size={13} style={{ color: 'var(--text-muted)' }} /> {Math.round(vm.hardware.memoryMb / 1024)}GB
                        </span>
                        <span title="Simulated Storage" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <HardDrive size={13} style={{ color: 'var(--text-muted)' }} /> {vm.hardware.diskSizeGb}GB
                        </span>
                      </div>
                    </td>
                    <td>
                      <code
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.775rem',
                          background: 'rgba(0, 0, 0, 0.3)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          color: vm.currentState.network.connected ? 'var(--text-secondary)' : '#f87171',
                        }}
                      >
                        {vm.currentState.network.ipAddress}
                      </code>
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <Camera size={14} style={{ color: 'var(--color-brand)' }} />
                        <span>{vm.snapshotCount}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Start Button */}
                        {onStartVM && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title={canStart ? `Start ${vm.name}` : 'Cannot start'}
                            disabled={!canStart}
                            onClick={() => onStartVM(vm.id)}
                            data-testid={`action-start-${vm.id}`}
                            style={{
                              color: canStart ? '#34d399' : 'var(--text-muted)',
                              padding: '0.3rem 0.4rem',
                            }}
                          >
                            <Play size={14} />
                          </button>
                        )}

                        {/* Stop Button */}
                        {onStopVM && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title={canStop ? `Stop ${vm.name}` : 'Cannot stop'}
                            disabled={!canStop}
                            onClick={() => onStopVM(vm.id)}
                            data-testid={`action-stop-${vm.id}`}
                            style={{
                              color: canStop ? '#f87171' : 'var(--text-muted)',
                              padding: '0.3rem 0.4rem',
                            }}
                          >
                            <Square size={14} />
                          </button>
                        )}

                        {/* Restart Button */}
                        {onRestartVM && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title={canRestart ? `Restart ${vm.name}` : 'Cannot restart'}
                            disabled={!canRestart}
                            onClick={() => onRestartVM(vm.id)}
                            data-testid={`action-restart-${vm.id}`}
                            style={{
                              color: canRestart ? '#38bdf8' : 'var(--text-muted)',
                              padding: '0.3rem 0.4rem',
                            }}
                          >
                            <RotateCw size={14} />
                          </button>
                        )}

                        {/* Delete Button */}
                        {onDeleteVMClick && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title={`Delete ${vm.name}`}
                            onClick={() => onDeleteVMClick(vm)}
                            data-testid={`action-delete-${vm.id}`}
                            style={{
                              color: '#f87171',
                              padding: '0.3rem 0.4rem',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}

                        {/* Inspect Button */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectVM(vm)}
                          data-testid={`view-vm-details-${vm.id}`}
                          style={{ marginLeft: '0.25rem' }}
                        >
                          <Eye size={14} />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
