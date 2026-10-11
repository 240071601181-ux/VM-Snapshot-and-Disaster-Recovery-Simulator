import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, apiFetch } from '../api/client';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { total: 2 })));
    const data = await apiFetch<{ total: number }>('/api/vms');
    expect(data).toEqual({ total: 2 });
  });

  it('parses FastAPI validation errors into ApiError 422', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(422, { error: 'validation_error', detail: 'name: Value error' }))
    );
    try {
      await apiFetch('/api/vms', { method: 'POST', body: {} });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.isValidationError).toBe(true);
      expect(apiErr.message).toContain('name: Value error');
    }
  });

  it('parses HTTPException detail payloads (409/404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(409, { detail: "VM with id 'x' already exists" }))
    );
    try {
      await apiFetch('/api/vms', { method: 'POST', body: {} });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.isConflict).toBe(true);
      expect(apiErr.message).toContain('already exists');
    }
  });

  it('maps unreachable backends to status-0 network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    try {
      await apiFetch('/api/dashboard');
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(0);
      expect(apiErr.isNetworkError).toBe(true);
    }
  });

  it('maps aborts to timeout errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      )
    );
    try {
      await apiFetch('/api/vms', { timeoutMs: 20 });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(0);
      expect(apiErr.code).toBe('timeout');
    }
  });
});
