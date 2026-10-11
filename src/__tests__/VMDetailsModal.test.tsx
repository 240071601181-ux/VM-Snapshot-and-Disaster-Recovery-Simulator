import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VMDetailsModal } from '../components/vms/VMDetailsModal';
import { SIMULATED_VMS } from '../mock/simulatedData';

describe('VMDetailsModal Component', () => {
  const mockVm = SIMULATED_VMS[0]; // prod-db-primary

  it('does not render when isOpen is false', () => {
    render(<VMDetailsModal vm={mockVm} isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal with VM hardware specs on overview tab', () => {
    render(<VMDetailsModal vm={mockVm} isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Simulated VM Inspector: prod-db-primary/i)).toBeInTheDocument();
    expect(screen.getByText(/8 Cores/i)).toBeInTheDocument();
    expect(screen.getByText(/32 GB/i)).toBeInTheDocument();
    expect(screen.getByText(/500 GB Virtual Disk/i)).toBeInTheDocument();
  });

  it('switches between tabs: processes, filesystem, network', () => {
    render(<VMDetailsModal vm={mockVm} isOpen={true} onClose={() => {}} />);

    // Switch to processes tab
    fireEvent.click(screen.getByTestId('vm-tab-processes'));
    expect(screen.getByText('postgres-master')).toBeInTheDocument();
    expect(screen.getByText('wal-writer')).toBeInTheDocument();

    // Switch to filesystem tab
    fireEvent.click(screen.getByTestId('vm-tab-filesystem'));
    expect(screen.getByText('/etc/postgresql/postgresql.conf')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /SHA-256 Hash/i })).toBeInTheDocument();

    // Switch to network tab
    fireEvent.click(screen.getByTestId('vm-tab-network'));
    expect(screen.getByText('10.0.12.44')).toBeInTheDocument();
    expect(screen.getByText(/Packets Transmitted/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<VMDetailsModal vm={mockVm} isOpen={true} onClose={handleClose} />);

    fireEvent.click(screen.getByTestId('vm-details-close-btn'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', () => {
    const handleClose = vi.fn();
    render(<VMDetailsModal vm={mockVm} isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
