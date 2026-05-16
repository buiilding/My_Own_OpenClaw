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

  let socket = null;
  let shouldMaintainConnection = false;
  let intentionalCloseReason = null;
  let reconnectTimer = null;
  let idleDisconnectTimer = null;
  const connectWaiters = new Set();
  const reconnectIntervalMs = options.reconnectIntervalMs || DEFAULT_RECONNECT_INTERVAL_MS;
  const connectTimeoutMs = options.connectTimeoutMs || DEFAULT_CONNECT_TIMEOUT_MS;
  const idleDisconnectTimeoutMs = options.idleDisconnectTimeoutMs || DEFAULT_IDLE_DISCONNECT_TIMEOUT_MS;

  function isOpen() {
    return socket && socket.readyState === WebSocketImpl.OPEN;
  }

  function isConnecting() {
    return socket && socket.readyState === WebSocketImpl.CONNECTING;
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function clearIdleDisconnectTimer() {
    if (idleDisconnectTimer !== null) {
      clearTimeout(idleDisconnectTimer);
      idleDisconnectTimer = null;
    }
  }

  function resolveConnectWaiters() {
    for (const waiter of connectWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve(true);
    }
    connectWaiters.clear();
  }

  function rejectConnectWaiters(error) {
    for (const waiter of connectWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
    connectWaiters.clear();
  }

  function scheduleReconnect(delayMs = reconnectIntervalMs) {
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect({ force: true });
    }, delayMs);
  }

  function syncIdleTimer(reason = 'idle-sync') {
    clearIdleDisconnectTimer();
    if (!shouldMaintainConnection || !isOpen()) {
      return;
    }
    if (typeof options.shouldHoldOpen === 'function' && options.shouldHoldOpen()) {
      return;
    }
    idleDisconnectTimer = setTimeout(() => {
      options.log?.(`Closing idle backend websocket after ${idleDisconnectTimeoutMs}ms (${reason}).`);
      intentionalCloseReason = 'idle-timeout';
      shouldMaintainConnection = false;
      clearReconnectTimer();
      clearIdleDisconnectTimer();
      if (socket && (socket.readyState === WebSocketImpl.OPEN || socket.readyState === WebSocketImpl.CONNECTING)) {
        socket.close();
      }
    }, idleDisconnectTimeoutMs);
  }

  function noteTraffic(reason = 'traffic') {
    if (!shouldMaintainConnection) {
      return;
    }
    syncIdleTimer(reason);
  }

  function sendBackendMessage(type, payload, messageId = null) {
    return sendEnvelope({
      type,
      payload,
      messageId,
      userId: options.getUserId?.(),
      normalizePayload: options.normalizePayload,
    });
  }

  function sendQuery(payload, messageId = null) {
    return sendBackendMessage('query', payload, messageId);
  }

  function sendWakewordDetected(payload, messageId = null) {
    return sendBackendMessage('wakeword-detected', payload, messageId);
  }

  function sendStopQuery(payload, messageId = null) {
    return sendBackendMessage('stop-query', payload, messageId);
  }

  function sendUpdateSettings(payload, messageId = null) {
    return sendBackendMessage('update-settings', payload, messageId);
  }

  function sendListModels(payload = {}, messageId = null) {
    return sendBackendMessage('list-models', payload, messageId);
  }

  function handleBackendEvent(data) {
    routeSdkToolEventToLocalRuntime(data, {
      executeLocalTool: options.executeLocalTool,
      sendMessageToBackend: sendBackendMessage,
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

  function connect({ force = false } = {}) {
    shouldMaintainConnection = true;
    if (!force && !shouldMaintainConnection) {
      return;
    }
    if (isOpen() || isConnecting()) {
      options.log?.('Windie SDK runtime websocket already open or connecting.');
      return;
    }

    const endpoint = options.getEndpoint?.() || {};
    const wsUrl = endpoint.wsUrl;
    if (!wsUrl) {
      throw new Error('Windie SDK runtime requires a backend websocket URL');
    }

    options.log?.(`Windie SDK runtime connecting to backend at ${wsUrl}...`);
    const nextSocket = createBackendSocket({
      WebSocketImpl,
      wsUrl,
      wsOrigin: endpoint.wsOrigin,
      headers: options.getHeaders?.() || {},
    });
    socket = nextSocket;
    options.onSocketChange?.(socket);
    let opened = false;

    nextSocket.on('open', async () => {
      if (socket !== nextSocket) {
        return;
      }
      opened = true;
      try {
        const handshake = await options.buildHandshake?.();
        nextSocket.send(JSON.stringify(handshake));
        options.onOpen?.({ socket: nextSocket, handshake });
        resolveConnectWaiters();
        noteTraffic('ws-open');
      } catch (error) {
        options.onHandshakeError?.(error);
        rejectConnectWaiters(error);
      }
    });

    nextSocket.on('message', (message) => {
      if (socket !== nextSocket) {
        return;
      }
      try {
        const data = JSON.parse(message);
        handleBackendEvent(data);
      } catch (error) {
        options.onMessageError?.(error);
      }
    });

    nextSocket.on('close', () => {
      if (socket !== nextSocket) {
        return;
      }
      socket = null;
      options.onSocketChange?.(socket);
      clearIdleDisconnectTimer();
      const closeReason = intentionalCloseReason;
      intentionalCloseReason = null;
      const shouldReconnect = shouldMaintainConnection && !closeReason;
      let fallbackScheduled = false;
      if (!opened && shouldReconnect && options.advanceEndpoint?.()) {
        options.onFallback?.();
        scheduleReconnect(0);
        fallbackScheduled = true;
      }
      options.onClose?.({ opened, closeReason, shouldReconnect, fallbackScheduled });
      if (!shouldReconnect && !opened) {
        rejectConnectWaiters(
          new Error(`Backend websocket closed before connecting (${closeReason || 'not-demanded'}).`),
        );
        return;
      }
      if (shouldReconnect && !fallbackScheduled) {
        scheduleReconnect(reconnectIntervalMs);
      }
    });

    nextSocket.on('error', (error) => {
      if (socket !== nextSocket) {
        return;
      }
      options.onError?.({ error, opened, socket: nextSocket });
      if (!opened && shouldMaintainConnection && options.advanceEndpoint?.()) {
        socket = null;
        options.onSocketChange?.(socket);
        options.onFallback?.();
        connect({ force: true });
        return;
      }
      if (!opened && !shouldMaintainConnection) {
        rejectConnectWaiters(error);
      }
      if (nextSocket.readyState === WebSocketImpl.OPEN) {
        nextSocket.close();
      }
    });
  }

  async function ensureConnected({ reason = 'request', timeoutMs = connectTimeoutMs } = {}) {
    shouldMaintainConnection = true;
    clearReconnectTimer();
    clearIdleDisconnectTimer();
    await options.beforeConnect?.({ reason });
    if (isOpen()) {
      syncIdleTimer(`ensure:${reason}`);
      return true;
    }
    const waitPromise = new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          connectWaiters.delete(waiter);
          reject(new Error(`Timed out connecting to backend for ${reason}.`));
        }, timeoutMs),
      };
      connectWaiters.add(waiter);
    });
    connect({ force: true });
    await waitPromise;
    syncIdleTimer(`connected:${reason}`);
    return true;
  }

  function sendEnvelope({
    type,
    payload,
    messageId,
    userId,
    normalizePayload,
  }) {
    if (!isOpen()) {
      options.log?.('Cannot send message: Windie SDK runtime websocket is not connected.');
      return null;
    }
    if (!userId) {
      options.log?.('Cannot send message: user_id not set.');
      return null;
    }
    const id = messageId || options.createMessageId?.();
    const message = {
      id,
      type,
      payload: typeof normalizePayload === 'function' ? normalizePayload(type, payload) : payload,
      user_id: userId,
      timestamp: new Date().toISOString(),
    };
    try {
      socket.send(JSON.stringify(message));
      options.onSend?.(type);
      return id;
    } catch (error) {
      options.log?.(`Error sending message to backend: ${error}`);
      return null;
    }
  }

  function close(reason = 'runtime-close') {
    shouldMaintainConnection = false;
    intentionalCloseReason = reason;
    clearReconnectTimer();
    clearIdleDisconnectTimer();
    rejectConnectWaiters(new Error('Windie SDK runtime closed.'));
    const current = socket;
    socket = null;
    options.onSocketChange?.(socket);
    if (
      current
      && (current.readyState === WebSocketImpl.OPEN || current.readyState === WebSocketImpl.CONNECTING)
      && typeof current.close === 'function'
    ) {
      current.close(1000, reason);
    }
  }

  return {
    close,
    connect,
    getSocket: () => socket,
    ensureConnected,
    isConnecting,
    isOpen,
    noteTraffic,
    reconnectIntervalMs,
    sendBackendMessage,
    sendEnvelope,
    sendListModels,
    sendQuery,
    sendStopQuery,
    sendUpdateSettings,
    sendWakewordDetected,
    syncIdleTimer,
  };
}

module.exports = {
  buildWindieSdkMainHandshake,
  createWindieSdkMainRuntime,
};
