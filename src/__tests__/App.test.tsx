import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('App Dashboard Shell & Navigation', () => {
  it('renders the persistent simulator disclaimer banner', () => {
    render(<App />);
    expect(screen.getByText(/SIMULATOR ACTIVE:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No real hypervisors or host resources are used/i)
    ).toBeInTheDocument();
  });

  it('renders sidebar navigation and brand name', () => {
    render(<App />);
    expect(screen.getByText('SIM-HYPERVISOR')).toBeInTheDocument();
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-vms')).toBeInTheDocument();
    expect(screen.getByTestId('nav-snapshots')).toBeInTheDocument();
    expect(screen.getByTestId('nav-dr-metrics')).toBeInTheDocument();
    expect(screen.getByTestId('nav-activity')).toBeInTheDocument();
  });

  it('navigates to Virtual Machines view when clicking sidebar nav link', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-vms'));
    expect(screen.getByText('Virtual Machine Inventory')).toBeInTheDocument();
    expect(screen.getByTestId('vm-inventory-section')).toBeInTheDocument();
  });

  it('navigates to Snapshot History view', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-snapshots'));
    expect(screen.getByText('Snapshot Lineage & History')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-history-section')).toBeInTheDocument();
  });

  it('navigates to DR & Recovery SLA view', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-dr-metrics'));
    expect(screen.getByText('Disaster Recovery Metrics & SLA')).toBeInTheDocument();
    expect(screen.getByTestId('dr-metrics-section')).toBeInTheDocument();
  });

  it('navigates to Audit Activity view', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('nav-activity'));
    expect(screen.getByText('Audit Log & Recovery Activity')).toBeInTheDocument();
    expect(screen.getByTestId('recent-activity-panel')).toBeInTheDocument();
  });

  it('toggles simulated loading state', () => {
    render(<App />);
    const loadingToggle = screen.getByTestId('toggle-loading-btn');
    fireEvent.click(loadingToggle);
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(
      screen.getByText(/Synchronizing simulated VM snapshots/i)
    ).toBeInTheDocument();

    // Toggle off
    fireEvent.click(screen.getByTestId('toggle-loading-btn'));
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
  });

  it('toggles simulated error banner', () => {
    render(<App />);
    const errorToggle = screen.getByTestId('toggle-error-btn');
    fireEvent.click(errorToggle);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText(/Simulated telemetry feed disconnection/i)).toBeInTheDocument();

    // Dismiss error via Retry button
    const retryBtn = screen.getByText('Retry');
    fireEvent.click(retryBtn);
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument();
  });

  it('opens and closes VM inspector modal', () => {
    render(<App />);
    // Click inspect on prod-db-primary
    const inspectBtn = screen.getByTestId('view-vm-details-vm-prod-db-01');
    fireEvent.click(inspectBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Simulated VM Inspector: prod-db-primary/i)).toBeInTheDocument();

    // Close via close button
    const closeBtn = screen.getByTestId('vm-details-close-btn');
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
