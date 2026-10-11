import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SnapshotHistorySection } from '../components/snapshots/SnapshotHistorySection';
import { SIMULATED_SNAPSHOTS } from '../mock/simulatedData';

describe('SnapshotHistorySection Component', () => {
  it('renders snapshot history table and all initial snapshots', () => {
    render(<SnapshotHistorySection snapshots={SIMULATED_SNAPSHOTS} />);
    expect(screen.getByText('Point-in-Time Snapshot History')).toBeInTheDocument();
    expect(screen.getByText('Daily Golden Baseline (Consistent)')).toBeInTheDocument();
    expect(screen.getByText('Pre-Patch Safety Checkpoint')).toBeInTheDocument();
  });

  it('filters snapshots by target virtual machine', () => {
    render(<SnapshotHistorySection snapshots={SIMULATED_SNAPSHOTS} />);
    const vmFilter = screen.getByTestId('snapshot-vm-filter');

    fireEvent.change(vmFilter, { target: { value: 'auth-vault-srv' } });
    expect(screen.getByText('Pre-Patch Safety Checkpoint')).toBeInTheDocument();
    expect(screen.queryByText('Daily Golden Baseline (Consistent)')).not.toBeInTheDocument();
  });

  it('displays empty state when filtered VM has no snapshots', () => {
    render(<SnapshotHistorySection snapshots={[]} />);
    expect(screen.getByText('No Snapshots Recorded')).toBeInTheDocument();
  });
});
