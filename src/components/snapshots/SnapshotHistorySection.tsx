import React, { useState } from 'react';
import {
  Camera,
  GitBranch,
  CheckCircle2,
  Clock,
  HardDrive,
  Filter,
} from 'lucide-react';
import { Snapshot } from '../../types';
import { EmptyState } from '../common/FeedbackStates';

interface SnapshotHistorySectionProps {
  snapshots: Snapshot[];
}

export const SnapshotHistorySection: React.FC<SnapshotHistorySectionProps> = ({
  snapshots,
}) => {
  const [selectedVmFilter, setSelectedVmFilter] = useState<string>('all');

  const uniqueVms = Array.from(new Set(snapshots.map((s) => s.vmName)));

  const filteredSnapshots = snapshots.filter(
    (s) => selectedVmFilter === 'all' || s.vmName === selectedVmFilter
  );

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <div className="dashboard-panel" data-testid="snapshot-history-section">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Camera size={18} style={{ color: 'var(--color-brand)' }} />
            <span>Point-in-Time Snapshot History</span>
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
              {filteredSnapshots.length} Snapshots
            </span>
          </h2>
          <div className="panel-subtitle">
            Immutable point-in-time captured states, tree lineage, and delta sizes
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select
            value={selectedVmFilter}
            onChange={(e) => setSelectedVmFilter(e.target.value)}
            aria-label="Filter snapshots by virtual machine"
            data-testid="snapshot-vm-filter"
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
            <option value="all">All Virtual Machines</option>
            {uniqueVms.map((vmName) => (
              <option key={vmName} value={vmName}>
                {vmName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredSnapshots.length === 0 ? (
        <EmptyState
          title="No Snapshots Recorded"
          description="There are currently no point-in-time snapshots created for this selection."
          actionText="Show All Snapshots"
          onAction={() => setSelectedVmFilter('all')}
        />
      ) : (
        <div className="table-responsive">
          <table className="data-table" data-testid="snapshot-table">
            <thead>
              <tr>
                <th>Snapshot Name</th>
                <th>Target VM</th>
                <th>Lineage Depth</th>
                <th>Simulated Delta</th>
                <th>Consistency</th>
                <th>Timestamp</th>
                <th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSnapshots.map((snap) => (
                <tr key={snap.id} data-testid={`snapshot-row-${snap.id}`}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {snap.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          maxWidth: '280px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {snap.description}
                      </span>
                    </div>
                  </td>
                  <td>
                    <code
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        color: 'var(--color-brand)',
                      }}
                    >
                      {snap.vmName}
                    </code>
                  </td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <GitBranch size={14} style={{ color: 'var(--text-muted)' }} />
                      <span>{snap.treeDepth === 0 ? 'Root (0)' : `Depth ${snap.treeDepth}`}</span>
                    </div>
                  </td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <HardDrive size={13} style={{ color: 'var(--text-muted)' }} />
                      <span>{formatBytes(snap.sizeBytes)}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: snap.isConsistent
                          ? 'rgba(16, 185, 129, 0.12)'
                          : 'rgba(245, 158, 11, 0.12)',
                        color: snap.isConsistent ? '#34d399' : '#fbbf24',
                        border: `1px solid ${
                          snap.isConsistent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                        }`,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {snap.isConsistent ? 'App-Consistent' : 'Crash-Consistent'}
                    </span>
                  </td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.775rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Clock size={13} />
                      <span>{new Date(snap.createdAt).toLocaleString()}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        color: '#34d399',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={14} /> Ready
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
