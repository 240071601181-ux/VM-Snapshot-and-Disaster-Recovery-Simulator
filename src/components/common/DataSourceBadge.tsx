import React from 'react';
import { Cloud, FlaskConical } from 'lucide-react';

export type DataSource = 'demo' | 'live';

interface DataSourceBadgeProps {
  source: DataSource;
  onToggle?: (next: DataSource) => void;
}

/**
 * Explicit Demo vs Live separation: demo renders in-browser mock/engine
 * state; live renders backend API responses only. Never mixed silently.
 */
export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ source, onToggle }) => {
  const isLive = source === 'live';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div
        data-testid="datasource-badge"
        title={isLive ? 'Showing live backend API data' : 'Showing local demo simulation data'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.65rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 700,
          background: isLive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          border: `1px solid ${isLive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
          color: isLive ? '#34d399' : '#fbbf24',
        }}
      >
        {isLive ? <Cloud size={14} /> : <FlaskConical size={14} />}
        <span>{isLive ? 'LIVE — BACKEND API' : 'DEMO — LOCAL SIMULATION'}</span>
      </div>
      {onToggle && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onToggle(isLive ? 'demo' : 'live')}
          data-testid="datasource-toggle-btn"
          title={isLive ? 'Switch back to local demo data' : 'Connect to the FastAPI backend'}
        >
          {isLive ? 'Use Demo Data' : 'Connect Backend'}
        </button>
      )}
    </div>
  );
};
