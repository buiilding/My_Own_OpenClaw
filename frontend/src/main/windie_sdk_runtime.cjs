const {
  buildAgentCapabilityHandshakePayload,
} = require('./agent_capability_handshake.cjs');
const {
  buildClientToolManifestWithMcp,
} = require('./mcp_runtime.cjs');
const {
  markRendererToolEventDisplayOnly,
  routeSdkToolEventToLocalRuntime,
} = require('./ipc/ipc_sdk_tool_router.cjs');
const {
  createWindieSdkBackendSocket,
} = require('./windie_sdk_backend_socket.cjs');
const {
  createManagedBackendSession,
} = require('../../../packages/windie-sdk-js/src/transport/ManagedBackendSession.cjs');

const DEFAULT_RECONNECT_INTERVAL_MS = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_IDLE_DISCONNECT_TIMEOUT_MS = 30 * 60 * 1000;

async function buildWindieSdkMainHandshake(options = {}) {
  const frontendConfig = options.frontendConfig || {};
  const clientToolManifest = await buildClientToolManifestWithMcp({
    disabledTools: frontendConfig?.agent_disabled_local_tools,
  });
  if (Array.isArray(clientToolManifest.mcp_errors) && clientToolManifest.mcp_errors.length > 0) {
    options.log?.(`MCP discovery completed with ${clientToolManifest.mcp_errors.length} error(s).`);
  }
  const handshakeClientToolManifest = {
    version: clientToolManifest.version,
    tools: clientToolManifest.tools,
  };
  return {
    type: 'handshake',
    user_id: options.userId,
    operating_system: options.operatingSystem,
    ...buildAgentCapabilityHandshakePayload({
      clientToolManifest: handshakeClientToolManifest,
      operatingSystem: options.operatingSystem,
      customInstructions: frontendConfig?.agent_custom_instructions,
      disabledTools: frontendConfig?.agent_disabled_local_tools,
      requestedAgentPolicy: {
        disabled_tools: frontendConfig?.agent_disabled_remote_tools,
      },
    }),
  };
}

function createWindieSdkMainRuntime(options = {}) {
  const WebSocketImpl = options.WebSocketImpl;
  if (!WebSocketImpl) {
    throw new Error('createWindieSdkMainRuntime requires WebSocketImpl');
  }
  const createBackendSocket = options.createBackendSocket || createWindieSdkBackendSocket;

  function handleBackendEvent(data) {
    routeSdkToolEventToLocalRuntime(data, {
      executeLocalTool: options.executeLocalTool,
      sendToolResult: (payload, messageId) => session.sendToolResult(payload, messageId),
      sendToolBundleResult: (payload, messageId) => session.sendToolBundleResult(payload, messageId),
      log: options.log,
    });
    const rendererData = markRendererToolEventDisplayOnly(data);
    if (typeof options.onEvent === 'function') {
      options.onEvent(rendererData);
    } else {
      options.onMessage?.(rendererData);
    }
    return rendererData;
  }

  const session = createManagedBackendSession({
    createSocket: () => {
      const endpoint = options.getEndpoint?.() || {};
      const wsUrl = endpoint.wsUrl;
      if (!wsUrl) {
        throw new Error('Windie SDK runtime requires a backend websocket URL');
      }
      options.log?.(`Windie SDK runtime connecting to backend at ${wsUrl}...`);
      return createBackendSocket({
        WebSocketImpl,
        wsUrl,
        wsOrigin: endpoint.wsOrigin,
        headers: options.getHeaders?.() || {},
      });
    },
    buildHandshake: options.buildHandshake || (() => ({})),
    getUserId: () => options.getUserId?.(),
    normalizePayload: options.normalizePayload,
    createMessageId: options.createMessageId,
    reconnectIntervalMs: options.reconnectIntervalMs || DEFAULT_RECONNECT_INTERVAL_MS,
    connectTimeoutMs: options.connectTimeoutMs || DEFAULT_CONNECT_TIMEOUT_MS,
    idleDisconnectTimeoutMs: options.idleDisconnectTimeoutMs || DEFAULT_IDLE_DISCONNECT_TIMEOUT_MS,
    shouldHoldOpen: options.shouldHoldOpen,
    beforeConnect: options.beforeConnect,
    advanceEndpoint: options.advanceEndpoint,
    onFallback: options.onFallback,
    onSocketChange: options.onSocketChange,
    onOpen: options.onOpen,
    onClose: options.onClose,
    onError: options.onError,
    onHandshakeError: options.onHandshakeError,
    onMessageError: options.onMessageError,
    onEvent: handleBackendEvent,
    onSend: options.onSend,
    log: options.log,
  });

  return {
    close: reason => session.close(reason),
    connect: payload => session.connect(payload),
    getSocket: () => session.getSocket(),
    ensureConnected: payload => session.ensureConnected(payload),
    isConnecting: () => session.isConnecting(),
    isOpen: () => session.isOpen(),
    noteTraffic: reason => session.noteTraffic(reason),
    reconnectIntervalMs: options.reconnectIntervalMs || DEFAULT_RECONNECT_INTERVAL_MS,
    sendCompactHistory: (payload, messageId) => session.sendCompactHistory(payload, messageId),
    sendListModels: (payload, messageId) => session.sendListModels(payload, messageId),
    sendQuery: (payload, messageId) => session.sendQuery(payload, messageId),
    sendRehydrate: (payload, messageId) => session.sendRehydrateConversation(payload, messageId),
    sendStopQuery: (payload, messageId) => session.sendStopQuery(payload, messageId),
    sendToolBundleResult: (payload, messageId) => session.sendToolBundleResult(payload, messageId),
    sendToolResult: (payload, messageId) => session.sendToolResult(payload, messageId),
    sendUpdateSettings: (payload, messageId) => session.sendUpdateSettings(payload, messageId),
    sendWakewordDetected: (payload, messageId) => session.sendWakewordDetected(payload, messageId),
    syncIdleTimer: reason => session.syncIdleTimer(reason),
  };
}

module.exports = {
  buildWindieSdkMainHandshake,
  createWindieSdkMainRuntime,
};
