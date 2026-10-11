import React from 'react';
import { Layers, Loader2, AlertCircle } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionText,
  onAction,
}) => {
  return (
    <div className="state-box" data-testid="empty-state">
      <div className="state-icon">{icon || <Layers size={24} />}</div>
      <h3 className="state-title">{title}</h3>
      <p className="state-description">{description}</p>
      {actionText && onAction && (
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
};

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'Loading simulation data...' }) => {
  return (
    <div className="state-box" data-testid="loading-state" role="status">
      <Loader2 size={32} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{label}</p>
    </div>
  );
};

export const ErrorAlert: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => {
  return (
    <div className="error-banner" role="alert" data-testid="error-state">
      <AlertCircle size={20} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <strong>Simulation Error:</strong> {message}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
};
