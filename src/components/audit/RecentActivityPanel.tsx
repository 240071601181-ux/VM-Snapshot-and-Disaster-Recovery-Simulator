import React, { useState } from 'react';
import {
  History,
  Filter,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react';
import { AuditEvent } from '../../types';
import { SeverityBadge } from '../common/Badge';
import { EmptyState } from '../common/FeedbackStates';

interface RecentActivityPanelProps {
  events: AuditEvent[];
  maxItems?: number;
}

export const RecentActivityPanel: React.FC<RecentActivityPanelProps> = ({
  events,
  maxItems,
}) => {
  const [filterType, setFilterType] = useState<string>('all');

  const filteredEvents = events.filter(
    (ev) => filterType === 'all' || ev.type === filterType
  );

  const displayEvents = maxItems ? filteredEvents.slice(0, maxItems) : filteredEvents;

  const getEventIcon = (severity: string) => {
    switch (severity) {
      case 'success':
        return <CheckCircle2 size={16} style={{ color: '#34d399' }} />;
      case 'warning':
        return <AlertTriangle size={16} style={{ color: '#fbbf24' }} />;
      case 'error':
        return <XCircle size={16} style={{ color: '#f87171' }} />;
      default:
        return <Info size={16} style={{ color: '#38bdf8' }} />;
    }
  };

  return (
    <div className="dashboard-panel" data-testid="recent-activity-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <History size={18} style={{ color: 'var(--color-brand)' }} />
            <span>Simulated Audit Ledger</span>
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
              {displayEvents.length} Events
            </span>
          </h2>
          <div className="panel-subtitle">
            Chronological audit trail of VM state changes, snapshots, and recovery events
          </div>
        </div>

        {!maxItems && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter events by audit type"
              data-testid="audit-type-filter"
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
              <option value="all">All Audit Actions</option>
              <option value="snapshot_taken">Snapshots Created</option>
              <option value="recovery_initiated">Recovery Initiated</option>
              <option value="recovery_succeeded">Recovery Succeeded</option>
              <option value="failure_injected">Failure Injected</option>
            </select>
          </div>
        )}
      </div>

      {displayEvents.length === 0 ? (
        <EmptyState
          title="No Audit Records"
          description="No simulated audit entries found matching the active filter criteria."
          actionText="Clear Filter"
          onAction={() => setFilterType('all')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {displayEvents.map((event) => (
            <div
              key={event.id}
              data-testid={`audit-event-${event.id}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                transition: 'background 0.15s ease',
              }}
            >
              <div
                style={{
                  marginTop: '0.15rem',
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {getEventIcon(event.severity)}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {event.title}
                    </span>
                    <SeverityBadge severity={event.severity} />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <Clock size={12} />
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {event.details}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.725rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.2rem',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <User size={12} /> {event.operator}
                  </span>
                  {event.vmName && (
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand)' }}>
                      Target: {event.vmName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
