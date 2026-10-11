import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon: React.ReactNode;
  trend?: string;
  testId?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtext,
  icon,
  testId,
}) => {
  return (
    <div className="metric-card" data-testid={testId || `metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="metric-card-header">
        <span>{title}</span>
        <div className="metric-icon-wrap" aria-hidden="true">
          {icon}
        </div>
      </div>
      <div className="metric-value-row">
        <span className="metric-value">{value}</span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {subtext && <div className="metric-subtext">{subtext}</div>}
    </div>
  );
};
