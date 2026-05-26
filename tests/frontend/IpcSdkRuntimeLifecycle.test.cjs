const {
  createSdkRuntimeLifecycle,
} = require('../../frontend/src/main/ipc/ipc_sdk_runtime_lifecycle.cjs');

function createHarness(overrides = {}) {
  let runtimeOptions = null;
  let activeQueryContext = overrides.activeQueryContext || null;
  const state = {
    connected: false,
    firstQuery: false,
    currentSessionId: 'session-1',
    currentServerUserId: 'server-user-1',
    currentUserId: 'user-1',
    currentConversationRef: 'conv-1',
    responseOverlayPhase: overrides.responseOverlayPhase || 'idle',
  };
  const deps = {
    WebSocketImpl: function FakeWebSocket() {},
    createMessageId: jest.fn(() => 'message-id'),
    createWindieSdkMainRuntime: jest.fn((options) => {
      runtimeOptions = options;
      return {
        close: jest.fn(),
        isOpen: jest.fn(() => true),
        options,
      };
    }),
    buildWindieSdkMainHandshake: jest.fn(async (payload) => ({
      type: 'handshake',
      ...payload,
    })),
    buildQueryInterrupted: jest.fn((payload) => ({
      type: 'error',
      turn_ref: payload.queryMessageId,
      payload: { interrupted: true },
    })),
    persistMemoryStoreEvent: jest.fn(),
    processBackendMessageData: jest.fn(),
    normalizeBackendPayload: jest.fn((payload) => payload),
    executeToolForBackend: jest.fn(),
    storeMemory: jest.fn(),
    getEndpoint: jest.fn(() => ({ wsUrl: 'ws://backend', httpUrl: 'http://backend' })),
    getHeaders: jest.fn(() => ({ Authorization: 'Bearer token' })),
    beforeConnect: jest.fn(),
    getOperatingSystem: jest.fn(() => 'macOS'),
    getFrontendConfig: jest.fn(() => ({ selected_model_id: 'gpt-5' })),
    getUserId: jest.fn(() => state.currentUserId),
    getCurrentConversationRef: jest.fn(() => state.currentConversationRef),
    getCurrentSessionId: jest.fn(() => state.currentSessionId),
    getCurrentServerUserId: jest.fn(() => state.currentServerUserId),
    getActiveQueryContext: jest.fn(() => activeQueryContext),
    setActiveQueryContext: jest.fn((queryContext) => {
      activeQueryContext = queryContext;
    }),
    markActiveQueryAccepted: jest.fn(() => {
      if (activeQueryContext) {
        activeQueryContext.accepted = true;
      }
    }),
    setConnected: jest.fn((nextValue) => {
      state.connected = nextValue;
    }),
    setFirstQuery: jest.fn((nextValue) => {
      state.firstQuery = nextValue;
    }),
    resetSettingsSyncState: jest.fn(),
    resetBackendSessionState: jest.fn(),
    getResponseOverlayPhase: jest.fn(() => state.responseOverlayPhase),
    setResponseOverlayPhase: jest.fn((phase) => {
      state.responseOverlayPhase = phase;
    }),
    shouldHoldOpen: jest.fn(() => false),
    advanceEndpoint: jest.fn(),
    appendReplayEvent: jest.fn(),
    clearReplayEvents: jest.fn(),
    noteBackendTraffic: jest.fn(),
    notifyBackendMessageObservers: jest.fn(),
    resolveSettingsSync: jest.fn(),
    setCurrentSessionId: jest.fn((value) => {
      state.currentSessionId = value;
    }),
    setCurrentServerUserId: jest.fn((value) => {
      state.currentServerUserId = value;
    }),
    setCurrentConversationRef: jest.fn((value) => {
      state.currentConversationRef = value;
    }),
    broadcastToRenderers: jest.fn(),
    broadcastConnectionStatus: jest.fn(),
    flushPendingListModelsRequest: jest.fn(),
    connectTimeoutMs: 100,
    reconnectIntervalMs: 200,
    idleDisconnectTimeoutMs: 300,
    log: jest.fn(),
    ...overrides,
  };

  const lifecycle = createSdkRuntimeLifecycle(deps);
  const runtime = lifecycle.getRuntime();
  return {
    deps,
    lifecycle,
    runtime,
    getRuntimeOptions: () => runtimeOptions,
    getActiveQueryContext: () => activeQueryContext,
    state,
  };
}

describe('ipc_sdk_runtime_lifecycle', () => {
  test('builds runtime once with injected transport and lifecycle callbacks', () => {
    const { deps, lifecycle, runtime } = createHarness();

    expect(lifecycle.getRuntime()).toBe(runtime);
    expect(deps.createWindieSdkMainRuntime).toHaveBeenCalledTimes(1);
    expect(deps.createWindieSdkMainRuntime).toHaveBeenCalledWith(expect.objectContaining({
      WebSocketImpl: deps.WebSocketImpl,
      createMessageId: deps.createMessageId,
      getEndpoint: deps.getEndpoint,
      getHeaders: deps.getHeaders,
      beforeConnect: deps.beforeConnect,
      executeLocalTool: deps.executeToolForBackend,
      normalizePayload: deps.normalizeBackendPayload,
      connectTimeoutMs: 100,
      reconnectIntervalMs: 200,
      idleDisconnectTimeoutMs: 300,
    }));
  });

  test('reports and closes the cached runtime instance', () => {
    const { lifecycle, runtime } = createHarness();

    expect(lifecycle.isRuntimeOpen()).toBe(true);

    lifecycle.closeRuntime('done');

    expect(runtime.close).toHaveBeenCalledWith('done');
    expect(lifecycle.isRuntimeOpen()).toBe(false);
  });

  test('builds handshake from current user, OS, and frontend config', async () => {
    const { deps, getRuntimeOptions } = createHarness();

    await expect(getRuntimeOptions().buildHandshake()).resolves.toEqual({
      type: 'handshake',
      userId: 'user-1',
      operatingSystem: 'macOS',
      frontendConfig: { selected_model_id: 'gpt-5' },
      log: deps.log,
    });
  });

  test('onOpen resets connection state and flushes queued model requests', () => {
    const { deps, state, getRuntimeOptions } = createHarness();

    getRuntimeOptions().onOpen();

    expect(state.connected).toBe(true);
    expect(state.firstQuery).toBe(true);
    expect(deps.resetSettingsSyncState).toHaveBeenCalledTimes(1);
    expect(deps.setResponseOverlayPhase).toHaveBeenCalledWith('idle', 'ws-open');
    expect(deps.clearReplayEvents).toHaveBeenCalledTimes(1);
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(true);
    expect(deps.flushPendingListModelsRequest).toHaveBeenCalledTimes(1);
  });

  test('handleEvent marks accepted active query and delegates backend processing', () => {
    const activeQueryContext = {
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      accepted: false,
    };
    const { deps, lifecycle, getActiveQueryContext } = createHarness({
      activeQueryContext,
    });

    lifecycle.handleEvent({ type: 'query-accepted', turn_ref: 'turn-1' });

    expect(getActiveQueryContext().accepted).toBe(true);
    expect(deps.appendReplayEvent).toHaveBeenCalledWith({ type: 'query-accepted', turn_ref: 'turn-1' });
    expect(deps.noteBackendTraffic).toHaveBeenCalledWith('message:query-accepted');
    expect(deps.notifyBackendMessageObservers).toHaveBeenCalledWith({ type: 'query-accepted', turn_ref: 'turn-1' });
    expect(deps.processBackendMessageData).toHaveBeenCalledWith(
      { type: 'query-accepted', turn_ref: 'turn-1' },
      expect.objectContaining({
        setCurrentSessionId: deps.setCurrentSessionId,
        setCurrentServerUserId: deps.setCurrentServerUserId,
        setCurrentConversationRef: deps.setCurrentConversationRef,
        resolveSettingsSync: deps.resolveSettingsSync,
      }),
    );
  });

  test('handleEvent clears active query replay on terminal turn event', () => {
    const activeQueryContext = {
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      accepted: true,
    };
    const { deps, lifecycle, getActiveQueryContext } = createHarness({
      activeQueryContext,
    });

    lifecycle.handleEvent({ type: 'streaming-complete', turn_ref: 'turn-1' });

    expect(getActiveQueryContext()).toBeNull();
    expect(deps.clearReplayEvents).toHaveBeenCalledTimes(1);
  });

  test('onClose emits interrupted event for active loop disconnects', () => {
    const activeQueryContext = {
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      accepted: true,
    };
    const { deps, getRuntimeOptions, getActiveQueryContext, state } = createHarness({
      activeQueryContext,
      responseOverlayPhase: 'streaming',
    });

    getRuntimeOptions().onClose({ closeReason: 'closed', shouldReconnect: false });

    expect(state.connected).toBe(false);
    expect(deps.buildQueryInterrupted).toHaveBeenCalledWith({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      currentSessionId: 'session-1',
      currentServerUserId: 'server-user-1',
      currentUserId: 'user-1',
      accepted: true,
    });
    expect(deps.processBackendMessageData).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', turn_ref: 'turn-1' }),
      expect.any(Object),
    );
    expect(getActiveQueryContext()).toBeNull();
    expect(deps.resetBackendSessionState).toHaveBeenCalledTimes(1);
    expect(deps.broadcastConnectionStatus).toHaveBeenCalledWith(false);
  });
});
