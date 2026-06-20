/**
 * Backend endpoint resolution for Electron main process and local runtime consumers.
 *
 * Supported env vars:
 * - BACKEND_WS_URL   (highest priority for WebSocket URL)
 * - BACKEND_HTTP_URL (highest priority for HTTP base URL)
 * - BACKEND_HOST + BACKEND_PORT (explicit endpoint override)
 * - host-supplied hosted-default override env keys
 */

const DEFAULT_LOOPBACK_BACKEND_HOST = '127.0.0.1';
const DEFAULT_LOOPBACK_BACKEND_PORT = '8765';
const DEFAULT_ENDPOINT_DEFAULT_ENV = Object.freeze({
  defaultHttpUrl: 'AGENT_DEFAULT_BACKEND_HTTP_URL',
  defaultWsUrl: 'AGENT_DEFAULT_BACKEND_WS_URL',
});
const DEFAULT_ENDPOINT_DEFAULTS = Object.freeze({
  httpUrl: `http://${DEFAULT_LOOPBACK_BACKEND_HOST}:${DEFAULT_LOOPBACK_BACKEND_PORT}`,
  wsUrl: `ws://${DEFAULT_LOOPBACK_BACKEND_HOST}:${DEFAULT_LOOPBACK_BACKEND_PORT}/ws`,
  env: DEFAULT_ENDPOINT_DEFAULT_ENV,
});
let configuredEndpointDefaults = normalizeEndpointDefaults();

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

function normalizeEndpointPair(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') {
    return null;
  }
  const httpUrl = normalizeUrl(endpoint.httpUrl, ['http:', 'https:']);
  const wsUrl = normalizeUrl(endpoint.wsUrl, ['ws:', 'wss:']);
  if (!httpUrl && !wsUrl) {
    return null;
  }
  const normalizedHttpUrl = httpUrl || toHttpUrl(wsUrl);
  const normalizedWsUrl = wsUrl || toWsUrl(httpUrl);
  return {
    httpUrl: normalizedHttpUrl,
    wsUrl: normalizedWsUrl,
    wsOrigin: normalizedHttpUrl,
  };
}

function dedupeEndpointCandidates(candidates = []) {
  const seen = new Set();
  const normalized = [];

  for (const candidate of candidates) {
    const endpoint = normalizeEndpointPair(candidate);
    if (!endpoint) {
      continue;
    }
    const key = `${endpoint.httpUrl}::${endpoint.wsUrl}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(endpoint);
  }

  return normalized;
}

function normalizeEndpointDefaults(endpointDefaults = DEFAULT_ENDPOINT_DEFAULTS) {
  const config = endpointDefaults && typeof endpointDefaults === 'object'
    ? endpointDefaults
    : {};
  const envConfig = config.env && typeof config.env === 'object'
    ? config.env
    : {};
  return {
    httpUrl: config.httpUrl,
    wsUrl: config.wsUrl,
    env: {
      defaultHttpUrl: typeof envConfig.defaultHttpUrl === 'string'
        ? envConfig.defaultHttpUrl
        : DEFAULT_ENDPOINT_DEFAULT_ENV.defaultHttpUrl,
      defaultWsUrl: typeof envConfig.defaultWsUrl === 'string'
        ? envConfig.defaultWsUrl
        : DEFAULT_ENDPOINT_DEFAULT_ENV.defaultWsUrl,
    },
  };
}

function configureBackendEndpointRuntime(endpointDefaults = DEFAULT_ENDPOINT_DEFAULTS) {
  configuredEndpointDefaults = normalizeEndpointDefaults(endpointDefaults);
  return configuredEndpointDefaults;
}

function resolveConfiguredDefaultEndpoints(env, endpointDefaults = configuredEndpointDefaults) {
  const defaultConfig = normalizeEndpointDefaults(endpointDefaults);
  const explicitDefaultHttpUrl = normalizeUrl(
    env[defaultConfig.env.defaultHttpUrl],
    ['http:', 'https:'],
  );
  const explicitDefaultWsUrl = normalizeUrl(
    env[defaultConfig.env.defaultWsUrl],
    ['ws:', 'wss:'],
  );
  if (explicitDefaultHttpUrl && explicitDefaultWsUrl) {
    return { httpUrl: explicitDefaultHttpUrl, wsUrl: explicitDefaultWsUrl };
  }
  if (explicitDefaultHttpUrl) {
    return {
      httpUrl: explicitDefaultHttpUrl,
      wsUrl: toWsUrl(explicitDefaultHttpUrl),
    };
  }
  if (explicitDefaultWsUrl) {
    return {
      httpUrl: toHttpUrl(explicitDefaultWsUrl),
      wsUrl: explicitDefaultWsUrl,
    };
  }
  return {
    httpUrl: defaultConfig.httpUrl,
    wsUrl: defaultConfig.wsUrl,
  };
}

function resolveLoopbackFallbackEndpoints(env) {
  const host = env.BACKEND_HOST || DEFAULT_LOOPBACK_BACKEND_HOST;
  const port = String(env.BACKEND_PORT || DEFAULT_LOOPBACK_BACKEND_PORT);
  const httpUrl = `http://${host}:${port}`;
  const wsUrl = `ws://${host}:${port}/ws`;

  return { httpUrl, wsUrl };
}

function resolveBackendEndpoints(env = process.env, options = {}) {
  const explicitHttpUrl = normalizeUrl(env.BACKEND_HTTP_URL, ['http:', 'https:']);
  const explicitWsUrl = normalizeUrl(env.BACKEND_WS_URL, ['ws:', 'wss:']);

  let httpUrl = explicitHttpUrl;
  let wsUrl = explicitWsUrl;

  if (!httpUrl && !wsUrl) {
    const [fallback] = resolveBackendEndpointCandidates(env, options);
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

function resolveBackendEndpointCandidates(env = process.env, options = {}) {
  const endpointDefaults = (
    options?.endpointDefaults
    || options?.hostedBackend
    || configuredEndpointDefaults
  );
  const explicitHttpUrl = normalizeUrl(env.BACKEND_HTTP_URL, ['http:', 'https:']);
  const explicitWsUrl = normalizeUrl(env.BACKEND_WS_URL, ['ws:', 'wss:']);
  const explicitHostOrPortOverride = (
    typeof env.BACKEND_HOST === 'string'
    || typeof env.BACKEND_PORT === 'string'
  );

  if (explicitHttpUrl || explicitWsUrl) {
    return dedupeEndpointCandidates([
      {
        httpUrl: explicitHttpUrl || toHttpUrl(explicitWsUrl),
        wsUrl: explicitWsUrl || toWsUrl(explicitHttpUrl),
      },
    ]);
  }

  if (explicitHostOrPortOverride) {
    const loopbackCandidates = dedupeEndpointCandidates([
      resolveLoopbackFallbackEndpoints(env),
    ]);
    if (loopbackCandidates.length > 0) {
      return loopbackCandidates;
    }
  }

  return dedupeEndpointCandidates([
    resolveConfiguredDefaultEndpoints(env, endpointDefaults),
  ]);
}

function isLoopbackHttpUrl(url) {
  const normalized = normalizeUrl(url, ['http:', 'https:']);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

function resolvePreferredArtifactHttpUrl(activeHttpUrl, endpointCandidates = []) {
  const loopbackCandidate = Array.isArray(endpointCandidates)
    ? endpointCandidates.find((candidate) => isLoopbackHttpUrl(candidate?.httpUrl))
    : null;

  return (
    normalizeUrl(loopbackCandidate?.httpUrl, ['http:', 'https:'])
    || normalizeUrl(activeHttpUrl, ['http:', 'https:'])
    || resolveConfiguredDefaultEndpoints({}).httpUrl
  );
}

module.exports = {
  configureBackendEndpointRuntime,
  resolvePreferredArtifactHttpUrl,
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
};
