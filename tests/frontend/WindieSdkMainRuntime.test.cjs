const { EventEmitter } = require('events');
const {
  buildWindieSdkMainHandshake,
  createWindieSdkMainRuntime,
} = require('../../frontend/src/main/windie_sdk_runtime.cjs');
const {
  createWindieSdkBackendSocket,
} = require('../../packages/windie-sdk-js/src/transport/BackendSocketFactory.cjs');

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances = [];

  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  send(message) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }
}

describe('Windie SDK main runtime', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  test('creates backend sockets through the main SDK transport factory', () => {
    const socket = createWindieSdkBackendSocket({
      WebSocketImpl: FakeWebSocket,
      wsUrl: 'wss://api.windieos.com/ws',
      wsOrigin: 'app://windie',
      headers: { authorization: 'Bearer install-token' },
    });

    expect(socket.url).toBe('wss://api.windieos.com/ws');
    expect(socket.options).toEqual({
      origin: 'app://windie',
      headers: { authorization: 'Bearer install-token' },
    });
  });

  test('owns backend websocket handshake and typed sends for Electron main', async () => {
    const opened = jest.fn();
    const runtime = createWindieSdkMainRuntime({
      WebSocketImpl: FakeWebSocket,
      createMessageId: () => 'msg-1',
      getEndpoint: () => ({ wsUrl: 'wss://api.windieos.com/ws', wsOrigin: 'app://windie' }),
      getHeaders: () => ({ authorization: 'Bearer install-token' }),
      getUserId: () => 'dev-user',
      shouldConnect: () => true,
      buildHandshake: async () => ({ type: 'handshake', user_id: 'dev-user' }),
      onOpen: opened,
    });

    runtime.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await Promise.resolve();

    expect(socket.url).toBe('wss://api.windieos.com/ws');
    expect(socket.options.headers.authorization).toBe('Bearer install-token');
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'handshake', user_id: 'dev-user' });
    expect(opened).toHaveBeenCalled();
    expect(runtime.sendQuery({ text: 'hello' })).toBe('msg-1');
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      id: 'msg-1',
      type: 'query',
      payload: { text: 'hello' },
      user_id: 'dev-user',
    });
    expect(runtime.sendStopQuery({ conversation_ref: 'conv-1' })).toBe('msg-1');
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      id: 'msg-1',
      type: 'stop-query',
      payload: { conversation_ref: 'conv-1' },
      user_id: 'dev-user',
    });
    expect(runtime.sendUpdateSettings({ model_provider: 'openai' })).toBe('msg-1');
    expect(runtime.sendListModels()).toBe('msg-1');
    expect(runtime.rehydrateConversation({ conversation_ref: 'conv-1', messages: [] })).toBe('msg-1');
    expect(runtime.sendCompactHistory({ conversation_ref: 'conv-1' })).toBe('msg-1');
    expect(runtime.sendToolResult({ request_id: 'req-1', success: true })).toBe('msg-1');
    expect(runtime.sendToolBundleResult({ bundle_id: 'bundle-1', status: 'success' })).toBe('msg-1');
    expect(JSON.parse(socket.sent[3])).toMatchObject({
      type: 'update-settings',
      payload: { model_provider: 'openai' },
      user_id: 'dev-user',
    });
    expect(JSON.parse(socket.sent[4])).toMatchObject({
      type: 'list-models',
      payload: {},
      user_id: 'dev-user',
    });
    expect(JSON.parse(socket.sent[5])).toMatchObject({
      type: 'rehydrate-conversation',
      payload: { conversation_ref: 'conv-1', messages: [] },
      user_id: 'dev-user',
    });
    expect(JSON.parse(socket.sent[6])).toMatchObject({
      type: 'compact-history',
      payload: { conversation_ref: 'conv-1' },
      user_id: 'dev-user',
    });
    expect(JSON.parse(socket.sent[7])).toMatchObject({
      type: 'tool-result',
      payload: { request_id: 'req-1', success: true },
      user_id: 'dev-user',
    });
    expect(JSON.parse(socket.sent[8])).toMatchObject({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'bundle-1', status: 'success' },
      user_id: 'dev-user',
    });
  });

  test('delegates socket construction to the main SDK transport boundary', async () => {
    const createBackendSocket = jest.fn((socketOptions) => (
      createWindieSdkBackendSocket(socketOptions)
    ));
    const runtime = createWindieSdkMainRuntime({
      WebSocketImpl: FakeWebSocket,
      createBackendSocket,
      createMessageId: () => 'msg-1',
      getEndpoint: () => ({ wsUrl: 'wss://api.windieos.com/ws', wsOrigin: 'app://windie' }),
      getHeaders: () => ({ authorization: 'Bearer install-token' }),
      getUserId: () => 'dev-user',
      buildHandshake: async () => ({ type: 'handshake', user_id: 'dev-user' }),
    });

    runtime.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await Promise.resolve();

    expect(createBackendSocket).toHaveBeenCalledWith({
      WebSocketImpl: FakeWebSocket,
      wsUrl: 'wss://api.windieos.com/ws',
      wsOrigin: 'app://windie',
      headers: { authorization: 'Bearer install-token' },
    });
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'handshake', user_id: 'dev-user' });
  });

  test('owns connection waiters and reconnect scheduling', async () => {
    jest.useFakeTimers();
    try {
      const beforeConnect = jest.fn(async () => {});
      const onClose = jest.fn();
      const runtime = createWindieSdkMainRuntime({
        WebSocketImpl: FakeWebSocket,
        createMessageId: () => 'msg-1',
        getEndpoint: () => ({ wsUrl: 'wss://api.windieos.com/ws' }),
        beforeConnect,
        buildHandshake: async () => ({ type: 'handshake', user_id: 'dev-user' }),
        onClose,
        reconnectIntervalMs: 25,
      });

      const pending = runtime.ensureConnected({ reason: 'query', timeoutMs: 1000 });
      await Promise.resolve();
      expect(beforeConnect).toHaveBeenCalledWith({ reason: 'query' });
      const socket = FakeWebSocket.instances[0];
      socket.open();
      await pending;

      socket.close();
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ closeReason: null, shouldReconnect: true }),
      );

      jest.advanceTimersByTime(25);
      expect(FakeWebSocket.instances).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('owns backend tool event routing before renderer fan-out', async () => {
    const onEvent = jest.fn();
    const executeLocalTool = jest.fn(async () => ({
      success: true,
      data: { output: 'saved', llm_content: 'saved' },
    }));
    const runtime = createWindieSdkMainRuntime({
      WebSocketImpl: FakeWebSocket,
      createMessageId: () => 'tool-result-msg',
      getEndpoint: () => ({ wsUrl: 'wss://api.windieos.com/ws' }),
      getUserId: () => 'dev-user',
      buildHandshake: async () => ({ type: 'handshake', user_id: 'dev-user' }),
      executeLocalTool,
      onEvent,
    });

    runtime.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await Promise.resolve();

    socket.emit('message', JSON.stringify({
      id: 'event-1',
      type: 'tool-call',
      payload: {
        tool_name: 'save_note',
        request_id: 'req-save',
        parameters: { text: 'hello' },
        metadata: { attempt: 1 },
      },
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(executeLocalTool).toHaveBeenCalledWith({
      toolName: 'save_note',
      args: { text: 'hello' },
      requestId: 'req-save',
      toolCallId: null,
      correlationId: null,
    });
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      id: 'tool-result-msg',
      type: 'tool-result',
      payload: {
        request_id: 'req-save',
        success: true,
        data: { output: 'saved', llm_content: 'saved' },
      },
      user_id: 'dev-user',
    });
    expect(onEvent).toHaveBeenCalledWith({
      id: 'event-1',
      type: 'tool-call',
      payload: {
        tool_name: 'save_note',
        request_id: 'req-save',
        parameters: { text: 'hello' },
        metadata: {
          attempt: 1,
          skip_frontend_execution: true,
          execution_owner: 'sdk-runtime',
        },
      },
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'req-save:tool-output',
      type: 'tool-output',
      payload: expect.objectContaining({
        tool_name: 'save_note',
        request_id: 'req-save',
        success: true,
        output: 'saved',
        error: null,
        metadata: expect.objectContaining({
          execution_owner: 'sdk-runtime',
          display_projection: 'local-tool-result',
        }),
      }),
    }));
  });

  test('projects SDK-owned bundled tool results back to the renderer', async () => {
    const onEvent = jest.fn();
    const executeLocalTool = jest
      .fn()
      .mockResolvedValueOnce({ success: true, data: { output: 'docs listed', llm_content: 'docs listed' } })
      .mockResolvedValueOnce({ success: true, data: { output: 'readme read', llm_content: 'readme read' } });
    const runtime = createWindieSdkMainRuntime({
      WebSocketImpl: FakeWebSocket,
      createMessageId: () => 'bundle-result-msg',
      getEndpoint: () => ({ wsUrl: 'wss://api.windieos.com/ws' }),
      getUserId: () => 'dev-user',
      buildHandshake: async () => ({ type: 'handshake', user_id: 'dev-user' }),
      executeLocalTool,
      onEvent,
    });

    runtime.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await Promise.resolve();

    socket.emit('message', JSON.stringify({
      id: 'event-bundle-1',
      type: 'tool-bundle',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
      payload: {
        bundle_id: 'bundle-docs',
        tools: [
          { name: 'run_shell_command', args: { command: './bin/docs-list' } },
          { name: 'read_file', args: { path: 'README.md' } },
        ],
      },
    }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(JSON.parse(socket.sent[1])).toMatchObject({
      id: 'bundle-result-msg',
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-docs',
        status: 'success',
      },
      user_id: 'dev-user',
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'bundle-docs:tool-output',
      type: 'tool-output',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
      payload: expect.objectContaining({
        tool_name: 'tool-bundle',
        bundle_id: 'bundle-docs',
        success: true,
        output: expect.stringContaining('docs listed'),
        metadata: expect.objectContaining({
          execution_owner: 'sdk-runtime',
          display_projection: 'local-tool-bundle-result',
        }),
      }),
    }));
  });

  test('owns idle disconnect policy', async () => {
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      const runtime = createWindieSdkMainRuntime({
        WebSocketImpl: FakeWebSocket,
        getEndpoint: () => ({ wsUrl: 'wss://api.windieos.com/ws' }),
        buildHandshake: async () => ({ type: 'handshake', user_id: 'dev-user' }),
        shouldHoldOpen: () => false,
        onClose,
        idleDisconnectTimeoutMs: 10,
      });

      const pending = runtime.ensureConnected({ reason: 'idle-test', timeoutMs: 1000 });
      await Promise.resolve();
      const socket = FakeWebSocket.instances[0];
      socket.open();
      await pending;

      runtime.syncIdleTimer('test');
      jest.advanceTimersByTime(10);

      expect(socket.readyState).toBe(3);
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ closeReason: 'idle-timeout', shouldReconnect: false }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('builds Electron SDK handshakes with client tool manifests', async () => {
    const payload = await buildWindieSdkMainHandshake({
      userId: 'dev-user',
      operatingSystem: 'macOS',
      frontendConfig: {
        agent_custom_instructions: 'Prefer short answers.',
        agent_disabled_local_tools: ['browser'],
        agent_disabled_remote_tools: ['web_search'],
      },
    });

    expect(payload).toMatchObject({
      type: 'handshake',
      user_id: 'dev-user',
      operating_system: 'macOS',
      agent_definition: {
        prompt_layers: expect.arrayContaining([
          expect.objectContaining({
            id: 'custom-instructions',
            content: 'Prefer short answers.',
          }),
        ]),
        tools: expect.objectContaining({
          disabled_tools: ['browser'],
        }),
      },
      requested_agent_policy: {
        disabled_tools: ['web_search'],
      },
    });
    expect(payload.client_tool_manifest.tools.map((tool) => tool.name)).not.toContain('browser');
    expect(payload.available_tools).not.toContain('browser');
  });
});
