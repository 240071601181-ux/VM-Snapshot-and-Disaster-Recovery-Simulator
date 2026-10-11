import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VMInventoryTable } from '../components/vms/VMInventoryTable';
import { SIMULATED_VMS } from '../mock/simulatedData';

describe('VMInventoryTable Component', () => {
  it('renders table headers and all initial simulated VMs', () => {
    render(<VMInventoryTable vms={SIMULATED_VMS} onSelectVM={() => {}} />);
    expect(screen.getByText('VM Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Environment')).toBeInTheDocument();
    expect(screen.getByText('prod-db-primary')).toBeInTheDocument();
    expect(screen.getByText('prod-api-gateway')).toBeInTheDocument();
    expect(screen.getByText('auth-vault-srv')).toBeInTheDocument();
  });

  it('filters virtual machines by search query', () => {
    render(<VMInventoryTable vms={SIMULATED_VMS} onSelectVM={() => {}} />);
    const searchInput = screen.getByTestId('vm-search-input');

    fireEvent.change(searchInput, { target: { value: 'postgres' } });
    expect(screen.getByText('prod-db-primary')).toBeInTheDocument();
    expect(screen.queryByText('prod-api-gateway')).not.toBeInTheDocument();
  });

  it('filters virtual machines by power execution state', () => {
    render(<VMInventoryTable vms={SIMULATED_VMS} onSelectVM={() => {}} />);
    const stateFilter = screen.getByTestId('vm-state-filter');

    fireEvent.change(stateFilter, { target: { value: 'crashed' } });
    expect(screen.getByText('auth-vault-srv')).toBeInTheDocument();
    expect(screen.queryByText('prod-db-primary')).not.toBeInTheDocument();
  });

  it('filters virtual machines by environment', () => {
    render(<VMInventoryTable vms={SIMULATED_VMS} onSelectVM={() => {}} />);
    const envFilter = screen.getByTestId('vm-env-filter');

    fireEvent.change(envFilter, { target: { value: 'development' } });
    expect(screen.getByText('dev-batch-worker')).toBeInTheDocument();
    expect(screen.queryByText('prod-db-primary')).not.toBeInTheDocument();
  });

  it('displays empty state when no VMs match criteria and allows clearing filters', () => {
    render(<VMInventoryTable vms={SIMULATED_VMS} onSelectVM={() => {}} />);
    const searchInput = screen.getByTestId('vm-search-input');

    fireEvent.change(searchInput, { target: { value: 'non-existent-vm-query' } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No Virtual Machines Match Filter')).toBeInTheDocument();

    const clearBtn = screen.getByText('Clear Filters');
    fireEvent.click(clearBtn);
    expect(screen.getByText('prod-db-primary')).toBeInTheDocument();
  });

  it('calls onSelectVM callback when inspect button is clicked', () => {
    const handleSelect = vi.fn();
    render(<VMInventoryTable vms={SIMULATED_VMS} onSelectVM={handleSelect} />);

    const inspectBtn = screen.getByTestId('view-vm-details-vm-prod-db-01');
    fireEvent.click(inspectBtn);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vm-prod-db-01', name: 'prod-db-primary' })
    );
  });
});
