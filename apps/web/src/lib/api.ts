import type { AuthResponse } from '@udhay/shared';

/** Access token lives in memory only; the refresh token is an httpOnly cookie. */
let accessToken: string | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;
let onSessionLost: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setSessionLostHandler = (fn: () => void) => {
  onSessionLost = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: { missing?: string[]; [k: string]: unknown } = {},
  ) {
    super(message);
  }
}

/** Single-flight refresh so parallel 401s trigger only one refresh call. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as AuthResponse;
      accessToken = data.accessToken;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const send = () =>
    fetch(`/api${path}`, {
      ...rest,
      credentials: 'same-origin',
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });

  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) {
      res = await send();
    } else {
      onSessionLost?.();
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // A temporary password must be replaced before anything else works.
    if (res.status === 403 && body.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/change-password')) window.location.assign('/change-password');
    }
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(res.status, msg || res.statusText || 'Request failed', body);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}
