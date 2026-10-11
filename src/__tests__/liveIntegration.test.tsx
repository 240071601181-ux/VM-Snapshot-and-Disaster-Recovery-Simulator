import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../App';

interface MockReply {
  status?: number;
  body?: unknown;
}
type RouteTable = Record<string, Array<MockReply | Error> | MockReply | Error>;

interface Call {
  key: string;
  body?: unknown;
}

function installFetch(routes: RouteTable): Call[] {
  const calls: Call[] = [];
  const queues = new Map<string, Array<MockReply | Error>>();
  for (const [key, value] of Object.entries(routes)) {
    queues.set(key, Array.isArray(value) ? [...value] : [value]);
  }
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input).replace('http://localhost:8000', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url}`;
    let parsed: unknown;
    try {
      parsed = init?.body ? JSON.parse(init.body as string) : undefined;
    } catch {
      parsed = undefined;
    }
    calls.push({ key, body: parsed });
    const queue = queues.get(key);
    const next = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
    if (!next) throw new Error(`No fetch mock for ${key}`);
    if (next instanceof Error) throw next;
    const status = next.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(next.body ?? {}),
    };
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const vmDto = (overrides: Record<string, unknown> = {}) => ({
  id: 'live-vm-01',
  name: 'live-web-01',
  description: 'Live backend VM',
  environment: 'staging',
  os: 'Ubuntu 24.04 LTS',
  hardware: { cpu_cores: 4, memory_mb: 8192, disk_size_gb: 100 },
  power_state: 'running',
  active_snapshot_id: null,
  snapshot_count: 0,
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
  ...overrides,
});

const snapDto = (overrides: Record<string, unknown> = {}) => ({
  id: 'live-snap-01',
  vm_id: 'live-vm-01',
  vm_name: 'live-web-01',
  name: 'baseline',
  description: '',
  created_at: '2026-01-02T00:00:00+00:00',
  size_bytes: 0,
  is_consistent: true,
  schema_version: '1.0',
  environment: 'staging',
  os: 'Ubuntu 24.04 LTS',
  parent_snapshot_id: null,
  tree_depth: 0,
  power_state: 'stopped',
  hardware: { cpu_cores: 4, memory_mb: 8192, disk_size_gb: 100 },
  ...overrides,
});

const pageOf = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 100,
  total_pages: 1,
});

const dashDto = () => ({
  total_vms: 1,
  total_snapshots: 1,
  total_recovery_attempts: 0,
  successful_recoveries: 0,
  failed_recoveries: 0,
  success_rate_percent: 0,
  mean_time_to_recovery_seconds: 0,
  total_audit_events: 0,
});

function baseRoutes() {
  return {
    'GET /api/vms?page=1&page_size=100': { body: pageOf([vmDto()]) },
    'GET /api/snapshots?page=1&page_size=100': { body: pageOf([snapDto()]) },
    'GET /api/recovery?page=1&page_size=100': { body: pageOf([]) },
    'GET /api/audit?page=1&page_size=100': { body: pageOf([]) },
    'GET /api/failures?page=1&page_size=100': { body: pageOf([]) },
    'GET /api/dashboard': { body: dashDto() },
  };
}

async function goLive() {
  render(<App />);
  fireEvent.click(screen.getByTestId('datasource-toggle-btn'));
  await waitFor(() => {
    expect(screen.getByTestId('datasource-badge')).toHaveTextContent(/LIVE/);
  });
}

describe('Live backend integration', () => {
  it('connects to the backend and renders live VMs instead of demo data', async () => {
    installFetch(baseRoutes());
    await goLive();

    await waitFor(() => {
      expect(screen.getByTestId('vm-row-live-vm-01')).toBeInTheDocument();
    });
    expect(screen.queryByText('prod-db-primary')).not.toBeInTheDocument();
    expect(screen.getByText('live-web-01')).toBeInTheDocument();
  });

  it('creates a snapshot through the UI and refreshes history from the backend', async () => {
    const created = snapDto({ id: 'live-snap-02', name: 'pre-patch' });
    const calls = installFetch({
      ...baseRoutes(),
      'POST /api/vms/live-vm-01/snapshots': { status: 201, body: created },
      // First load shows one snapshot; every refresh after the POST shows two.
      'GET /api/snapshots?page=1&page_size=100': [
        { body: pageOf([snapDto()]) },
        { body: pageOf([snapDto(), created]) },
      ],
    });
    await goLive();
    await waitFor(() => {
      expect(screen.getByTestId('vm-row-live-vm-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('nav-snapshots'));
    fireEvent.click(screen.getByTestId('take-snapshot-open-btn'));
    fireEvent.change(screen.getByTestId('take-snapshot-name-input'), {
      target: { value: 'pre-patch' },
    });
    fireEvent.click(screen.getByTestId('take-snapshot-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('snapshot-row-live-snap-02')).toBeInTheDocument();
      expect(screen.getByTestId('lifecycle-toast-success')).toHaveTextContent(/pre-patch/);
    });

    const post = calls.find((c) => c.key === 'POST /api/vms/live-vm-01/snapshots');
    expect(post).toBeDefined();
    expect(post?.body).toMatchObject({ name: 'pre-patch' });
  });

  it('restoring a snapshot shows current/target states and updates the VM', async () => {
    const calls = installFetch({
      ...baseRoutes(),
      'GET /api/snapshots/live-snap-01/diff': {
        body: {
          snapshot_id: 'live-snap-01',
          vm_id: 'live-vm-01',
          power_state_diff: { snapshot: 'stopped', current: 'running', changed: true },
          hardware_diff: {
            cpu_cores: { snapshot: 4, current: 4, changed: false },
            memory_mb: { snapshot: 8192, current: 8192, changed: false },
            disk_size_gb: { snapshot: 100, current: 100, changed: false },
            has_changes: false,
          },
          has_any_differences: true,
        },
      },
      'POST /api/snapshots/live-snap-01/restore': { body: vmDto({ power_state: 'stopped' }) },
      // After restore, the VM list reports the stopped state.
      'GET /api/vms?page=1&page_size=100': [
        { body: pageOf([vmDto()]) },
        { body: pageOf([vmDto({ power_state: 'stopped' })]) },
      ],
    });
    await goLive();
    await waitFor(() => {
      expect(screen.getByTestId('vm-row-live-vm-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('nav-snapshots'));
    fireEvent.click(screen.getByTestId('restore-snapshot-live-snap-01'));

    await waitFor(() => {
      expect(screen.getByTestId('restore-state-compare')).toBeInTheDocument();
    });
    expect(screen.getByTestId('restore-current-state')).toHaveTextContent('running');
    expect(screen.getByTestId('restore-target-state')).toHaveTextContent('stopped');

    // Confirm is gated behind explicit acknowledgement.
    expect(screen.getByTestId('restore-confirm-submit-btn')).toBeDisabled();
    fireEvent.click(screen.getByTestId('restore-acknowledge-checkbox'));
    fireEvent.click(screen.getByTestId('restore-confirm-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('lifecycle-toast-success')).toHaveTextContent(/restored to 'baseline'/);
    });
    const restoreCall = calls.find((c) => c.key === 'POST /api/snapshots/live-snap-01/restore');
    expect(restoreCall?.body).toEqual({ vm_id: 'live-vm-01' });
    // Displayed VM state updated after the restore refresh.
    fireEvent.click(screen.getByTestId('nav-vms'));
    await waitFor(() => {
      const row = screen.getByTestId('vm-row-live-vm-01');
      expect(within(row).getByTestId('status-badge-stopped')).toBeInTheDocument();
    });
  });

  it('shows an error state with retry when the backend is unreachable', async () => {
    installFetch({ 'GET /api/vms?page=1&page_size=100': new Error('down') });
    render(<App />);
    fireEvent.click(screen.getByTestId('datasource-toggle-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });

    // Backend recovers: retry reloads live data.
    installFetch(baseRoutes());
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByTestId('vm-row-live-vm-01')).toBeInTheDocument();
    });
  });

  it('surfaces backend validation errors in the create form without closing it', async () => {
    installFetch({
      ...baseRoutes(),
      'POST /api/vms': {
        status: 422,
        body: { error: 'validation_error', detail: 'name: VM name cannot be blank' },
      },
    });
    await goLive();
    await waitFor(() => {
      expect(screen.getByTestId('vm-row-live-vm-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-vm-open-btn'));
    fireEvent.change(screen.getByTestId('create-vm-name-input'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('create-vm-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('create-vm-error')).toHaveTextContent(/VM name cannot be blank/);
    });
    // Modal stays open so the user can fix the input.
    expect(screen.getByText('Create Simulated Virtual Machine')).toBeInTheDocument();
  });
});
