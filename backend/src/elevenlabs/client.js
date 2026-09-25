const DEFAULT_BASE_URL = 'https://api.elevenlabs.io';

class ElevenLabsError extends Error {
  constructor(message, { status = 0, code = 'upstream', detail = '' } = {}) {
    super(message);
    this.name = 'ElevenLabsError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function codeForStatus(status, detailStatus) {
  if (detailStatus === 'quota_exceeded' || status === 402) return 'quota';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'upstream';
}

function extractDetail(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  const d = body.detail;
  if (!d) return JSON.stringify(body).slice(0, 500);
  if (typeof d === 'string') return d;
  if (d.message) return d.message;
  return JSON.stringify(d).slice(0, 500);
}

function buildUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Minimal ElevenLabs REST client. `fetchImpl` is injectable so unit tests never hit the network.
 */
function createClient({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  if (!apiKey) throw new Error('ElevenLabs client requires an apiKey');

  async function request(method, path, { query, json, form, headers = {}, responseType = 'json' } = {}) {
    const url = buildUrl(baseUrl, path, query);
    const init = { method, headers: { 'xi-api-key': apiKey, ...headers } };
    if (json !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(json);
    } else if (form) {
      init.body = form; // FormData: fetch sets the multipart boundary itself
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    if (controller) init.signal = controller.signal;

    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new ElevenLabsError(`ElevenLabs request timed out: ${method} ${path}`, { code: 'timeout' });
      }
      throw new ElevenLabsError(`ElevenLabs request failed: ${err.message}`, { code: 'upstream' });
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!res.ok) {
      let body = null;
      try {
        const ct = res.headers.get('content-type') || '';
        body = ct.includes('application/json') ? await res.json() : await res.text();
      } catch { /* ignore body parse failures */ }
      const detailStatus = body && typeof body === 'object' && body.detail && typeof body.detail === 'object' ? body.detail.status : undefined;
      const detail = extractDetail(body);
      throw new ElevenLabsError(`ElevenLabs ${method} ${path} → ${res.status}${detail ? `: ${detail}` : ''}`, {
        status: res.status,
        code: codeForStatus(res.status, detailStatus),
        detail,
      });
    }

    if (responseType === 'none' || res.status === 204) return null;
    if (responseType === 'buffer') return Buffer.from(await res.arrayBuffer());
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ElevenLabsError(`ElevenLabs ${method} ${path} returned non-JSON`, { status: res.status, code: 'upstream', detail: text.slice(0, 200) });
    }
  }

  return {
    request,
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    del: (path, opts) => request('DELETE', path, { responseType: 'none', ...opts }),
  };
}

let singleton = null;
/** Client built from config; lazily created so tests can import this module without env vars. */
function getClient() {
  if (!singleton) {
    const config = require('../config');
    singleton = createClient({ apiKey: config.elevenlabs.apiKey });
  }
  return singleton;
}

module.exports = { createClient, getClient, ElevenLabsError };
