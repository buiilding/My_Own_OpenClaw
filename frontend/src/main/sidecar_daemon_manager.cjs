const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveBackendEndpoints,
} = require('./backend_endpoints.cjs');
const {
  withLocalBackendNodeOptions,
} = require('./local_backend_bridge_utils.cjs');
const {
  resolveSidecarLaunchTarget,
} = require('./runtime_paths.cjs');

const DEFAULT_DAEMON_DISCOVERY_PATH = path.join(
  os.tmpdir(),
  'windieos',
  'sidecar-daemon.json',
);
const DEFAULT_DAEMON_START_TIMEOUT_MS = 10000;
const DEFAULT_DAEMON_POLL_INTERVAL_MS = 100;

function normalizeDiscovery(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const baseUrl = typeof raw.base_url === 'string' ? raw.base_url.trim() : '';
  const token = typeof raw.token === 'string' ? raw.token.trim() : '';
  const pid = Number.isFinite(Number(raw.pid)) ? Number(raw.pid) : null;
  if (!baseUrl || !token) {
    return null;
  }
  return {
    baseUrl,
    token,
    pid,
    host: typeof raw.host === 'string' ? raw.host : null,
    port: Number.isFinite(Number(raw.port)) ? Number(raw.port) : null,
    createdAt: Number.isFinite(Number(raw.created_at)) ? Number(raw.created_at) : null,
  };
}

function readDiscoveryFile(discoveryPath = DEFAULT_DAEMON_DISCOVERY_PATH) {
  try {
    if (!fs.existsSync(discoveryPath)) {
      return null;
    }
    return normalizeDiscovery(JSON.parse(fs.readFileSync(discoveryPath, 'utf8')));
  } catch (_error) {
    return null;
  }
}

function deleteDiscoveryFile(discoveryPath = DEFAULT_DAEMON_DISCOVERY_PATH) {
  try {
    fs.unlinkSync(discoveryPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`[SidecarDaemon] Failed to delete stale discovery file: ${error?.message || error}`);
    }
  }
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

class SidecarDaemonNodeClient {
  constructor({ baseUrl, token, fetchImpl = globalThis.fetch }) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('Sidecar daemon client requires a fetch implementation');
    }
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async health() {
    return this.request('/health', { method: 'GET' });
  }

  async status() {
    return this.request('/status', { method: 'GET' });
  }

  async listTools() {
    return this.request('/tools', { method: 'GET' });
  }

  async executeTool({ toolName, args }) {
    return this.post('/execute-tool', {
      tool_name: toolName,
      args: args && typeof args === 'object' && !Array.isArray(args) ? args : {},
    });
  }

  async rpc({ id, method, params }) {
    return this.post('/rpc', {
      jsonrpc: '2.0',
      id,
      method,
      params: params && typeof params === 'object' && !Array.isArray(params) ? params : {},
    });
  }

  async registerModuleTool(payload) {
    return this.post('/tools/register-module', payload);
  }

  async registerPlugin(payload) {
    return this.post('/plugins/register', payload);
  }

  async registerMcp(payload) {
    return this.post('/mcps/register', payload);
  }

  async shutdown() {
    return this.post('/shutdown', {});
  }

  async post(pathname, body) {
    return this.request(pathname, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async request(pathname, init = {}) {
    const headers = {
      ...(init.headers || {}),
      'x-windie-sidecar-token': this.token,
    };
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const body = typeof response.text === 'function' ? await response.text() : '';
      throw new Error(`Sidecar daemon request failed (${response.status}): ${body}`);
    }
    return response.json();
  }
}

function createDaemonClient(discovery, options = {}) {
  return new SidecarDaemonNodeClient({
    baseUrl: discovery.baseUrl,
    token: discovery.token,
    fetchImpl: options.fetchImpl,
  });
}

function buildEventWebSocketUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (normalized.startsWith('https://')) {
    return `wss://${normalized.slice('https://'.length)}/events`;
  }
  if (normalized.startsWith('http://')) {
    return `ws://${normalized.slice('http://'.length)}/events`;
  }
  return `${normalized}/events`;
}

function loadWebSocketImpl(options = {}) {
  if (typeof options.WebSocketImpl === 'function') {
    return options.WebSocketImpl;
  }
  try {
    return require('ws');
  } catch (_error) {
    return null;
  }
}

function buildDaemonEnv({ isPackaged = false, backendEndpoints, permissionStatePath, authStatePath, launchTarget } = {}) {
  const endpointConfig = backendEndpoints || resolveBackendEndpoints(process.env, {
    isPackaged,
  });
  const backendEnv = withLocalBackendNodeOptions({
    ...process.env,
    PYTHONUNBUFFERED: '1',
    WINDIE_BACKEND_HTTP_URL: endpointConfig.httpUrl,
    WINDIE_PACKAGED_APP: isPackaged ? '1' : '0',
    WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: isPackaged ? '0' : '1',
    ...(typeof authStatePath === 'string' && authStatePath.trim()
      ? { WINDIE_BACKEND_AUTH_STATE_PATH: authStatePath.trim() }
      : {}),
    ...(typeof permissionStatePath === 'string' && permissionStatePath.trim()
      ? { WINDIE_PERMISSION_STATE_PATH: permissionStatePath.trim() }
      : {}),
    ...(
      isPackaged
      && launchTarget?.kind === 'python'
        ? {
            PYTHONDONTWRITEBYTECODE: '1',
            ...(
              process.platform !== 'win32'
              && launchTarget.runtimeRoot
                ? {
                    PYTHONHOME: launchTarget.runtimeRoot,
                    PYTHONNOUSERSITE: '1',
                  }
                : {}
            ),
          }
        : {}
    ),
  });
  if (isPackaged && launchTarget?.kind === 'python') {
    delete backendEnv.PYTHONPATH;
  }
  return backendEnv;
}

function createSidecarDaemonManager(options = {}) {
  const discoveryPath = options.discoveryPath || DEFAULT_DAEMON_DISCOVERY_PATH;
  const startTimeoutMs = options.startTimeoutMs || DEFAULT_DAEMON_START_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs || DEFAULT_DAEMON_POLL_INTERVAL_MS;
  const spawnImpl = options.spawnImpl || spawn;
  let daemonProcess = null;
  let client = null;
  let ensurePromise = null;
  let eventSocket = null;
  let eventSocketKey = null;
  let activeDiscovery = null;
  const eventListeners = new Set();

  function closeEventSocket() {
    const socket = eventSocket;
    eventSocket = null;
    eventSocketKey = null;
    try {
      socket?.close?.();
    } catch (_error) {
      // Best-effort close for event streams.
    }
  }

  function connectEventStream(discovery) {
    if (!discovery?.baseUrl || !discovery?.token) {
      return;
    }
    if (eventListeners.size === 0) {
      return;
    }
    const key = `${discovery.baseUrl}|${discovery.token}`;
    if (eventSocket && eventSocketKey === key) {
      return;
    }
    closeEventSocket();
    const WebSocketImpl = loadWebSocketImpl(options);
    if (!WebSocketImpl) {
      return;
    }
    const url = buildEventWebSocketUrl(discovery.baseUrl);
    try {
      const socket = new WebSocketImpl(url, {
        headers: {
          'x-windie-sidecar-token': discovery.token,
        },
      });
      eventSocket = socket;
      eventSocketKey = key;
      socket.on?.('message', (raw) => {
        try {
          const payload = JSON.parse(String(raw || ''));
          if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            for (const listener of eventListeners) {
              listener(payload);
            }
          }
        } catch (_error) {
          // Ignore malformed sidecar event packets.
        }
      });
      socket.on?.('close', () => {
        if (eventSocket === socket) {
          eventSocket = null;
          eventSocketKey = null;
        }
      });
      socket.on?.('error', () => {});
    } catch (_error) {
      closeEventSocket();
    }
  }

  async function probe(discovery) {
    if (!discovery) {
      return null;
    }
    const candidate = createDaemonClient(discovery, options);
    try {
      await candidate.health();
      return candidate;
    } catch (_error) {
      return null;
    }
  }

  async function reuseExistingDaemon() {
    const discovery = readDiscoveryFile(discoveryPath);
    const existing = await probe(discovery);
    if (existing) {
      client = existing;
      activeDiscovery = discovery;
      connectEventStream(discovery);
      return client;
    }
    if (discovery) {
      deleteDiscoveryFile(discoveryPath);
    }
    return null;
  }

  function spawnDaemon(launchOptions = {}) {
    const launchTarget = resolveSidecarLaunchTarget('sidecar_daemon.py');
    if (launchTarget.kind === 'python' && !launchTarget.command) {
      throw new Error('Python executable not found for Windie sidecar daemon');
    }
    if (launchTarget.kind === 'python' && !fs.existsSync(launchTarget.resolvedPath)) {
      throw new Error(`Sidecar daemon script not found: ${launchTarget.resolvedPath}`);
    }
    const args = [
      ...launchTarget.args,
      '--discovery-file',
      discoveryPath,
    ];
    daemonProcess = spawnImpl(launchTarget.command, args, {
      cwd: launchTarget.cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: buildDaemonEnv({
        ...launchOptions,
        launchTarget,
      }),
    });
    daemonProcess.stderr?.on?.('data', (chunk) => {
      const text = String(chunk || '').trim();
      if (text && process.env.NODE_ENV !== 'production') {
        console.log(`[SidecarDaemon] ${text}`);
      }
    });
    daemonProcess.on?.('exit', () => {
      daemonProcess = null;
      client = null;
    });
    daemonProcess.on?.('error', () => {
      daemonProcess = null;
      client = null;
    });
  }

  async function waitForDiscovery() {
    const deadline = Date.now() + startTimeoutMs;
    while (Date.now() < deadline) {
      const discovered = await probe(readDiscoveryFile(discoveryPath));
      if (discovered) {
        client = discovered;
        activeDiscovery = readDiscoveryFile(discoveryPath);
        connectEventStream(activeDiscovery);
        return client;
      }
      await sleep(pollIntervalMs);
    }
    throw new Error(`Timed out waiting for sidecar daemon discovery at ${discoveryPath}`);
  }

  async function ensureDaemon(launchOptions = {}) {
    if (client) {
      try {
        await client.health();
        connectEventStream(activeDiscovery);
        return client;
      } catch (_error) {
        client = null;
        activeDiscovery = null;
      }
    }
    if (ensurePromise) {
      return ensurePromise;
    }
    ensurePromise = (async () => {
      const reused = await reuseExistingDaemon();
      if (reused) {
        return reused;
      }
      spawnDaemon(launchOptions);
      return waitForDiscovery();
    })().finally(() => {
      ensurePromise = null;
    });
    return ensurePromise;
  }

  async function executeTool(payload, launchOptions = {}) {
    const daemonClient = await ensureDaemon(launchOptions);
    return daemonClient.executeTool(payload);
  }

  async function rpc(payload, launchOptions = {}) {
    const daemonClient = await ensureDaemon(launchOptions);
    return daemonClient.rpc(payload);
  }

  function getSnapshot() {
    return {
      discoveryPath,
      hasClient: Boolean(client),
      pid: daemonProcess?.pid || null,
    };
  }

  async function shutdown() {
    const activeClient = client;
    client = null;
    activeDiscovery = null;
    try {
      await activeClient?.shutdown?.();
    } catch (_error) {
      // Best-effort shutdown; process kill below handles local children.
    }
    if (daemonProcess && typeof daemonProcess.kill === 'function') {
      daemonProcess.kill('SIGTERM');
    }
    daemonProcess = null;
    closeEventSocket();
  }

  function subscribeEvents(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    eventListeners.add(listener);
    connectEventStream(activeDiscovery);
    return () => {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        closeEventSocket();
      }
    };
  }

  return {
    ensureDaemon,
    executeTool,
    getSnapshot,
    rpc,
    readDiscovery: () => readDiscoveryFile(discoveryPath),
    shutdown,
    subscribeEvents,
  };
}

module.exports = {
  DEFAULT_DAEMON_DISCOVERY_PATH,
  SidecarDaemonNodeClient,
  createSidecarDaemonManager,
  deleteDiscoveryFile,
  readDiscoveryFile,
};
