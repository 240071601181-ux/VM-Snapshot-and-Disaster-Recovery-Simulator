import React from 'react';
import {
  Clock,
  Sparkles,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { NavView } from '../../types';
import { DataSource, DataSourceBadge } from '../common/DataSourceBadge';

interface HeaderProps {
  currentView: NavView;
  onToggleSidebar?: () => void;
  onSimulateErrorToggle?: () => void;
  onSimulateLoadingToggle?: () => void;
  isSimulatingError?: boolean;
  isSimulatingLoading?: boolean;
  dataSource?: DataSource;
  onToggleDataSource?: (next: DataSource) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSimulateErrorToggle,
  onSimulateLoadingToggle,
  isSimulatingError,
  isSimulatingLoading,
  dataSource,
  onToggleDataSource,
}) => {
  const getHeading = (view: NavView) => {
    switch (view) {
      case 'dashboard':
        return 'System Overview & DR Health';
      case 'vms':
        return 'Virtual Machine Inventory';
      case 'snapshots':
        return 'Snapshot Lineage & History';
      case 'dr-metrics':
        return 'Disaster Recovery Metrics & SLA';
      case 'activity':
        return 'Audit Log & Recovery Activity';
    }
  };

  return (
    <header className="top-header" role="region" aria-label="Top Controls">
      <div className="header-title-section">
        <h1 className="view-heading">
          {getHeading(currentView)}
        </h1>
      </div>

      <div className="header-actions">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginRight: '0.5rem',
          }}
        >
          <Clock size={14} />
          <span>SIM TIME: LIVE</span>
        </div>

        {/* State simulation test triggers for verification of loading/error states */}
        {onSimulateLoadingToggle && (
          <button
            type="button"
            className={`btn btn-sm ${isSimulatingLoading ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onSimulateLoadingToggle}
            title="Toggle simulated loading state"
            data-testid="toggle-loading-btn"
          >
            <RefreshCw size={14} className={isSimulatingLoading ? 'spinner' : ''} />
            <span>{isSimulatingLoading ? 'Loading ON' : 'Test Loading'}</span>
          </button>
        )}

        {onSimulateErrorToggle && (
          <button
            type="button"
            className={`btn btn-sm ${isSimulatingError ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onSimulateErrorToggle}
            title="Toggle simulated error state"
            data-testid="toggle-error-btn"
          >
            <Sliders size={14} />
            <span>{isSimulatingError ? 'Error ON' : 'Test Error'}</span>
          </button>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.35rem 0.65rem',
            borderRadius: '6px',
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            fontSize: '0.75rem',
            color: 'var(--color-brand)',
            fontWeight: 600,
          }}
        >
          <Sparkles size={14} />
          <span>EPHEMERAL ENGINE</span>
        </div>

        {/* Demo vs Live backend data source (Live wires the FastAPI backend) */}
        {dataSource && (
          <DataSourceBadge source={dataSource} onToggle={onToggleDataSource} />
        )}
      </div>
    </header>
  );
};
