/**
 * Backend endpoint resolution for Electron main process + sidecar.
 *
 * Supported env vars:
 * - BACKEND_WS_URL   (highest priority for WebSocket URL)
 * - BACKEND_HTTP_URL (highest priority for HTTP base URL)
 * - BACKEND_HOST + BACKEND_PORT (fallback)
 */

const DEFAULT_BACKEND_HOST = '127.0.0.1';
const DEFAULT_BACKEND_PORT = '8765';

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeUrl(url, protocols) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!protocols.includes(parsed.protocol)) {
      return null;
    }
    parsed.search = '';
    parsed.hash = '';

    if (parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = '/';
      return trimTrailingSlash(parsed.toString());
    }

    parsed.pathname = trimTrailingSlash(parsed.pathname);
    return parsed.toString();
  } catch {
    return null;
  }
}

function toWsUrl(httpUrl) {
  const parsed = new URL(httpUrl);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  parsed.pathname = '/ws';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function toHttpUrl(wsUrl) {
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  parsed.search = '';
  parsed.hash = '';

  const wsPath = trimTrailingSlash(parsed.pathname || '/');
  if (wsPath === '/ws') {
    parsed.pathname = '/';
  } else {
    parsed.pathname = wsPath;
  }

  return trimTrailingSlash(parsed.toString());
}

function fallbackEndpoints(env) {
  const host = env.BACKEND_HOST || DEFAULT_BACKEND_HOST;
  const port = String(env.BACKEND_PORT || DEFAULT_BACKEND_PORT);
  const httpUrl = `http://${host}:${port}`;
  const wsUrl = `ws://${host}:${port}/ws`;

  return { httpUrl, wsUrl };
}

function resolveBackendEndpoints(env = process.env) {
  const explicitHttpUrl = normalizeUrl(env.BACKEND_HTTP_URL, ['http:', 'https:']);
  const explicitWsUrl = normalizeUrl(env.BACKEND_WS_URL, ['ws:', 'wss:']);
  const fallback = fallbackEndpoints(env);

  let httpUrl = explicitHttpUrl;
  let wsUrl = explicitWsUrl;

  if (!httpUrl && !wsUrl) {
    httpUrl = fallback.httpUrl;
    wsUrl = fallback.wsUrl;
  } else if (httpUrl && !wsUrl) {
    wsUrl = toWsUrl(httpUrl);
  } else if (!httpUrl && wsUrl) {
    httpUrl = toHttpUrl(wsUrl);
  }

  return {
    httpUrl,
    wsUrl,
    wsOrigin: httpUrl,
  };
}

module.exports = {
  DEFAULT_BACKEND_HOST,
  DEFAULT_BACKEND_PORT,
  resolveBackendEndpoints,
};
