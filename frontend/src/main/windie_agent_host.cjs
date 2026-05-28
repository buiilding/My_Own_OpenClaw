const {
  WindieAgent,
} = require('../../../packages/windie-sdk-js/cjs/index.js');
const {
  buildClientToolManifestWithMcp,
} = require('./mcp_runtime.cjs');

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeConversationRefFromPayload(payload, fallback = null) {
  if (!isPlainObject(payload)) {
    return fallback;
  }
  const value = payload.conversation_ref || payload.conversationRef;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function buildEndpointOptions(candidates = []) {
  return candidates
    .filter(candidate => candidate && typeof candidate === 'object')
    .map(candidate => ({
      httpBaseUrl: candidate.httpUrl,
      wsUrl: candidate.wsUrl,
      wsOrigin: candidate.wsOrigin,
    }))
    .filter(endpoint => endpoint.httpBaseUrl || endpoint.wsUrl);
}

function createElectronLocalRuntime({
  executeLocalTool,
  getFrontendConfig,
  log,
}) {
  return {
    status: async () => ({ ready: true, runtime: 'electron-local-backend' }),
    listTools: async () => {
      const frontendConfig = getFrontendConfig?.() || {};
      const manifest = await buildClientToolManifestWithMcp({
        disabledTools: frontendConfig?.agent_disabled_local_tools,
      });
      if (Array.isArray(manifest.mcp_errors) && manifest.mcp_errors.length > 0) {
        log?.(`MCP discovery completed with ${manifest.mcp_errors.length} error(s).`);
      }
      return {
        version: manifest.version,
        tools: manifest.tools,
      };
    },
    executeTool: async payload => executeLocalTool(payload),
  };
}

function createWindieAgentHost({
  WebSocketImpl,
  appName = 'WindieOS',
  getEndpoint,
  getEndpointCandidates,
  beforeConnect,
  getOperatingSystem,
  getFrontendConfig,
  getUserId,
  getInstallAuthState,
  executeLocalTool,
  shouldHoldOpen,
  reconnectIntervalMs,
  connectTimeoutMs,
  idleDisconnectTimeoutMs,
  onOpen,
  onClose,
  onError,
  onHandshakeError,
  onMessageError,
  onSend,
  onFallback,
  onRawBackendEvent,
  onRows,
  onConversationEvent,
  onCurrentTurn,
  onStatus,
  log,
}) {
  let agent = null;
  let startPromise = null;
  let closed = false;
  const detachListeners = [];

  function detachAll() {
    while (detachListeners.length > 0) {
      const detach = detachListeners.pop();
      try {
        detach?.();
      } catch (_error) {
        // Listener cleanup should not block runtime shutdown.
      }
    }
  }

  async function start({ conversationRef = null, reason = 'request' } = {}) {
    if (agent) {
      return agent;
    }
    if (startPromise) {
      return startPromise;
    }
    closed = false;
    startPromise = (async () => {
      await beforeConnect?.({ reason });
      const endpoint = getEndpoint?.() || {};
      const authState = getInstallAuthState?.() || {};
      const installToken = typeof authState.installToken === 'string'
        ? authState.installToken
        : null;
      const userId = typeof authState.userId === 'string' && authState.userId
        ? authState.userId
        : getUserId?.();
      const localRuntime = createElectronLocalRuntime({
        executeLocalTool,
        getFrontendConfig,
        log,
      });
      const started = await WindieAgent.startDesktop({
        appName,
        backendUrl: endpoint.httpUrl,
        wsUrl: endpoint.wsUrl,
        wsOrigin: endpoint.wsOrigin,
        backendEndpoints: buildEndpointOptions(getEndpointCandidates?.()),
        WebSocketImpl,
        installAuth: {
          autoRegister: false,
          installToken,
          installId: authState.installId,
          userId,
        },
        installToken,
        defaultUserId: userId,
        conversationRef: conversationRef || undefined,
        sidecar: localRuntime,
        autoStartLocalRuntime: false,
        builtins: 'default',
        reconnectIntervalMs,
        connectTimeoutMs,
        idleDisconnectTimeoutMs,
        operatingSystem: getOperatingSystem?.(),
        shouldHoldBackendConnectionOpen: shouldHoldOpen,
        beforeBackendConnect: async payload => {
          await beforeConnect?.(payload || { reason });
        },
        onBackendOpen: payload => onOpen?.(payload),
        onBackendClose: payload => onClose?.(payload),
        onBackendError: payload => onError?.(payload),
        onBackendHandshakeError: error => onHandshakeError?.(error),
        onBackendMessageError: error => onMessageError?.(error),
        onBackendSend: type => onSend?.(type),
        onBackendFallback: endpointPayload => onFallback?.(endpointPayload),
        log,
      });
      detachListeners.push(started.onRows(rows => onRows?.(rows)));
      detachListeners.push(started.onConversationEvent((event, snapshot) => {
        onConversationEvent?.(event, snapshot);
      }));
      detachListeners.push(started.onCurrentTurn((currentTurn, snapshot) => {
        onCurrentTurn?.(currentTurn, snapshot);
      }));
      detachListeners.push(started.onStatus(status => onStatus?.(status)));
      detachListeners.push(started.onBackendEvent(event => onRawBackendEvent?.(event)));
      agent = started;
      if (closed) {
        started.close?.();
      }
      return started;
    })().finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  async function ensureConnected(options = {}) {
    const started = await start(options);
    await started.ensureConnected();
  }

  async function run({ payload = {}, messageId = null } = {}) {
    const conversationRef = normalizeConversationRefFromPayload(payload, null);
    const started = await start({ conversationRef, reason: 'query' });
    const text = typeof payload.text === 'string' ? payload.text : '';
    return started.run({
      text,
      turnRef: messageId || undefined,
      payload,
    });
  }

  async function stop(payload = {}) {
    if (!agent) {
      return null;
    }
    return agent.stop({
      conversation_ref: normalizeConversationRefFromPayload(payload, null),
      turn_ref: isPlainObject(payload) && typeof payload.turn_ref === 'string'
        ? payload.turn_ref
        : null,
    });
  }

  async function updateSettings(payload = {}) {
    const started = await start({ reason: 'update-settings' });
    return started.updateSettings(payload);
  }

  async function requestModelList() {
    const started = await start({ reason: 'list-models' });
    return started.requestModelList();
  }

  async function rehydrate(payload = {}) {
    const started = await start({
      conversationRef: normalizeConversationRefFromPayload(payload, null),
      reason: 'rehydrate',
    });
    return started.rehydrateMessages(payload);
  }

  async function compactHistory(payload = {}) {
    const started = await start({
      conversationRef: normalizeConversationRefFromPayload(payload, null),
      reason: 'compact-history',
    });
    return started.compactHistory(payload);
  }

  async function wakewordDetected(payload = {}) {
    const started = await start({ reason: 'wakeword-detected' });
    return started.wakewordDetected(payload);
  }

  function isConnected() {
    return Boolean(agent?.isConnected?.());
  }

  function noteTraffic(reason) {
    agent?.noteBackendTraffic?.(reason);
  }

  function syncIdleTimer(reason) {
    agent?.syncBackendIdleTimer?.(reason);
  }

  function close(reason = 'agent-host-close') {
    closed = true;
    const current = agent;
    agent = null;
    detachAll();
    current?.close?.(reason);
    if (startPromise) {
      startPromise.then(started => {
        started?.close?.(reason);
      }).catch(() => {});
    }
  }

  return {
    close,
    compactHistory,
    ensureConnected,
    isConnected,
    noteTraffic,
    requestModelList,
    rehydrate,
    run,
    start,
    stop,
    syncIdleTimer,
    updateSettings,
    wakewordDetected,
  };
}

module.exports = {
  createWindieAgentHost,
};
