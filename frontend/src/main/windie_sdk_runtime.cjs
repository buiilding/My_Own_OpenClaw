const DEFAULT_RECONNECT_INTERVAL_MS = 1000;

function createWindieSdkMainRuntime(options = {}) {
  const WebSocketImpl = options.WebSocketImpl;
  if (!WebSocketImpl) {
    throw new Error('createWindieSdkMainRuntime requires WebSocketImpl');
  }

  let socket = null;

  function isOpen() {
    return socket && socket.readyState === WebSocketImpl.OPEN;
  }

  function isConnecting() {
    return socket && socket.readyState === WebSocketImpl.CONNECTING;
  }

  function connect() {
    if (typeof options.shouldConnect === 'function' && !options.shouldConnect()) {
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
    const nextSocket = new WebSocketImpl(wsUrl, {
      origin: endpoint.wsOrigin,
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
      } catch (error) {
        options.onHandshakeError?.(error);
      }
    });

    nextSocket.on('message', (message) => {
      if (socket !== nextSocket) {
        return;
      }
      try {
        const data = JSON.parse(message);
        options.onMessage?.(data);
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
      options.onClose?.({ opened });
    });

    nextSocket.on('error', (error) => {
      if (socket !== nextSocket) {
        return;
      }
      options.onError?.({ error, opened, socket: nextSocket });
    });
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
    isConnecting,
    isOpen,
    reconnectIntervalMs: options.reconnectIntervalMs || DEFAULT_RECONNECT_INTERVAL_MS,
    sendEnvelope,
  };
}

module.exports = {
  createWindieSdkMainRuntime,
};
