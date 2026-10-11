import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DRMetricsSection } from '../components/disasterRecovery/DRMetricsSection';
import { SIMULATED_DR_METRICS, SIMULATED_RECOVERY_ATTEMPTS } from '../mock/simulatedData';

describe('DRMetricsSection Component', () => {
  it('renders recovery success rate and SLA gauges', () => {
    render(
      <DRMetricsSection
        metrics={SIMULATED_DR_METRICS}
        recoveryAttempts={SIMULATED_RECOVERY_ATTEMPTS}
      />
    );

    expect(screen.getByText('87.5%')).toBeInTheDocument();
    expect(screen.getByText(/Recovery Success Rate/i)).toBeInTheDocument();
    expect(screen.getByTestId('metric-rpo')).toBeInTheDocument();
    expect(screen.getByTestId('metric-mttr')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument(); // total attempts
  });

  it('renders the simulated disaster recovery attempt log table with items', () => {
    render(
      <DRMetricsSection
        metrics={SIMULATED_DR_METRICS}
        recoveryAttempts={SIMULATED_RECOVERY_ATTEMPTS}
      />
    );

    expect(screen.getByTestId('recovery-attempts-table')).toBeInTheDocument();
    expect(screen.getByText('rec-001')).toBeInTheDocument();
    expect(screen.getByText('Match 100%')).toBeInTheDocument();
    expect(screen.getByText('succeeded')).toBeInTheDocument();
  });
});
