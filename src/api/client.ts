/**
 * API client core: typed fetch wrapper with timeout and backend error parsing.
 *
 * The FastAPI backend returns errors as `{"detail": "..."}` (HTTPException)
 * or `{"error": "...", "detail": "..."}` (validation / global handlers).
 * Network failures and timeouts are surfaced as ApiError with status 0 so
 * callers can render retry UI instead of fake data.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isValidationError(): boolean {
    return this.status === 422;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

function resolveBaseUrl(): string {
  const fromEnv =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_API_BASE_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/+$/, '');
  return 'http://localhost:8000';
}

function resolveTimeout(): number {
  const raw = (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env?.VITE_API_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, timeoutMs, headers, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? resolveTimeout());

  try {
    const response = await fetch(`${resolveBaseUrl()}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload: unknown = text.length > 0 ? safeParseJson(text) : null;

    if (!response.ok) {
      throw toApiError(response.status, payload);
    }
    return payload as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'Backend request timed out. The API may be unreachable.');
    }
    throw new ApiError(
      0,
      'network_error',
      'Cannot reach the backend API. Check that it is running and retry.'
    );
  } finally {
    clearTimeout(timer);
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text.slice(0, 500) };
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const detail = typeof record.detail === 'string' ? record.detail : '';
    const code = typeof record.error === 'string' ? record.error : 'http_error';
    const message = detail || `Backend request failed with status ${status}.`;
    return new ApiError(status, code, message);
  }
  return new ApiError(status, 'http_error', `Backend request failed with status ${status}.`);
}
