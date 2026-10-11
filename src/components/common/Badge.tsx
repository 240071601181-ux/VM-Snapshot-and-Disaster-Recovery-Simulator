import React from 'react';
import { VMExecutionState } from '../../types';

interface StatusBadgeProps {
  status: VMExecutionState;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return (
    <span className={`status-pill status-${status}`} data-testid={`status-badge-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
};

interface SeverityBadgeProps {
  severity: 'low' | 'medium' | 'high' | 'critical' | 'info' | 'warning' | 'error' | 'success';
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const getBadgeStyle = () => {
    switch (severity) {
      case 'critical':
      case 'error':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)' };
      case 'high':
      case 'warning':
        return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
      case 'medium':
      case 'info':
        return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.4)' };
      case 'low':
      case 'success':
        return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  const style = getBadgeStyle();

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.725rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        textTransform: 'uppercase',
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {severity}
    </span>
  );
};

interface EnvBadgeProps {
  environment: 'production' | 'staging' | 'development';
}

export const EnvBadge: React.FC<EnvBadgeProps> = ({ environment }) => {
  const isProd = environment === 'production';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.45rem',
        borderRadius: '4px',
        fontSize: '0.7rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        textTransform: 'uppercase',
        backgroundColor: isProd ? 'rgba(239, 68, 68, 0.12)' : 'rgba(148, 163, 184, 0.12)',
        color: isProd ? '#fca5a5' : '#cbd5e1',
        border: `1px solid ${isProd ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
      }}
    >
      {environment}
    </span>
  );
};
