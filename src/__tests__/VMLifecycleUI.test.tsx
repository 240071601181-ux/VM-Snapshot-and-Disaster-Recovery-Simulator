import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

describe('VM Lifecycle UI Integration Flow', () => {
  it('renders initial simulated VMs and action controls', async () => {
    render(<App />);

    expect(screen.getByTestId('vm-table')).toBeInTheDocument();
    expect(screen.getByTestId('create-vm-open-btn')).toBeInTheDocument();

    // Verify row for prod-db-primary
    expect(screen.getByText('prod-db-primary')).toBeInTheDocument();
  });

  it('opens Create VM modal and provisions a new simulated VM', async () => {
    render(<App />);

    // Click "+ New VM"
    const openBtn = screen.getByTestId('create-vm-open-btn');
    fireEvent.click(openBtn);

    // Modal should be open
    expect(screen.getByText('Create Simulated Virtual Machine')).toBeInTheDocument();

    // Fill form
    const nameInput = screen.getByTestId('create-vm-name-input');
    fireEvent.change(nameInput, { target: { value: 'analytics-worker-09' } });

    // Submit form
    const submitBtn = screen.getByTestId('create-vm-submit-btn');
    fireEvent.click(submitBtn);

    // Verify new VM appears in the table and success toast is displayed
    await waitFor(() => {
      expect(screen.getByText('analytics-worker-09')).toBeInTheDocument();
      expect(screen.getByTestId('lifecycle-toast-success')).toHaveTextContent(/Created simulated VM 'analytics-worker-09'/i);
    });
  });

  it('handles simulated power transitions (Stop -> Start)', async () => {
    render(<App />);

    // prod-db-primary (vm-prod-db-01) is currently running. Stop button should be enabled.
    const stopBtn = screen.getByTestId('action-stop-vm-prod-db-01');
    expect(stopBtn).not.toBeDisabled();

    fireEvent.click(stopBtn);

    // Should display halted toast
    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-toast-success')).toHaveTextContent(/Simulated VM 'prod-db-primary' halted/i);
    });

    // Start button should now be enabled
    const startBtn = screen.getByTestId('action-start-vm-prod-db-01');
    expect(startBtn).not.toBeDisabled();

    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-toast-success')).toHaveTextContent(/Simulated VM 'prod-db-primary' booted successfully/i);
    });
  });

  it('enforces confirmation name matching before deleting a simulated VM', async () => {
    render(<App />);

    // Click delete on dev-batch-worker (vm-dev-worker-01)
    const deleteBtn = screen.getByTestId('action-delete-vm-dev-worker-01');
    fireEvent.click(deleteBtn);

    // Confirmation modal should appear
    expect(screen.getByText('Confirm Simulated VM Deletion')).toBeInTheDocument();
    const submitDeleteBtn = screen.getByTestId('delete-confirm-submit-btn');

    // Confirm button must initially be disabled
    expect(submitDeleteBtn).toBeDisabled();

    const input = screen.getByTestId('delete-confirm-input');

    // Type incorrect name
    fireEvent.change(input, { target: { value: 'wrong-name' } });
    expect(submitDeleteBtn).toBeDisabled();

    // Type exact name 'dev-batch-worker'
    fireEvent.change(input, { target: { value: 'dev-batch-worker' } });
    expect(submitDeleteBtn).not.toBeDisabled();

    // Click confirm deletion
    fireEvent.click(submitDeleteBtn);

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-toast-success')).toHaveTextContent(/Simulated VM 'dev-batch-worker' successfully deleted/i);
      expect(screen.queryByText('dev-batch-worker')).not.toBeInTheDocument();
    });
  });
});
