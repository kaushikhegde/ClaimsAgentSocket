// Centralised backend base URL.
//
// In dev VITE_BACKEND_URL is unset, so this stays empty and the relative
// "/api" and "/ws" paths are handled by Vite's dev proxy (see vite.config.js).
//
// In production VITE_BACKEND_URL is baked in at build time (see the GitHub
// Actions workflow) and the browser talks to the backend App Service directly.
// The backend already sends `Access-Control-Allow-Origin: *`, so cross-origin
// fetch + WebSocket work without any extra config.
const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

export const apiUrl = (path) => `${BACKEND}${path}`;

export const wsUrl = (path = '/ws') => {
  if (BACKEND) return `${BACKEND.replace(/^http/, 'ws')}${path}`;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
};

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** fetch + JSON with a consistent error shape ({ error } bodies become ApiError.message). */
export async function apiFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(apiUrl(path), init);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`, data);
  return data;
}
