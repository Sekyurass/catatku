import type { ApiErrorBody, AuthResponse } from '@catatku/shared';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionLostHandler(handler: (() => void) | null) {
  onSessionLost = handler;
}

/** Tukar cookie refresh dengan access token baru. Panggilan bersamaan berbagi satu request. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshPromise ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as AuthResponse;
      accessToken = body.accessToken;
      return body;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error.code, body.error.message, body.error.fields);
  } catch {
    return new ApiError(res.status, 'INTERNAL', 'Terjadi kendala. Coba lagi sebentar lagi.');
  }
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const doFetch = () =>
    fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      signal: opts.signal,
      headers: {
        ...(opts.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res: Response;
  try {
    res = await doFetch();
    if (res.status === 401 && !path.startsWith('/auth/')) {
      const session = await refreshSession();
      if (session) {
        res = await doFetch();
      } else {
        onSessionLost?.();
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Tidak bisa terhubung. Periksa koneksi internet kamu.');
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Unduh file yang butuh Authorization (mis. ekspor CSV). */
export async function downloadFile(path: string, query: Query, filename: string) {
  const fetchFile = () =>
    fetch(buildUrl(path, query), {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  let res = await fetchFile();
  if (res.status === 401 && (await refreshSession())) res = await fetchFile();
  if (!res.ok) throw await toApiError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Safari membatalkan unduhan bila URL dicabut di tick yang sama dengan klik.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
