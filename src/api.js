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
