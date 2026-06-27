/** @jest-environment node */

const path = require('path');

const {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');
const {
  getActiveDisplayAffinity,
  setActiveDisplayAffinity,
} = require('../../src/main/surfaces/display_affinity_runtime.cjs');
const {
  BACKEND_RECONNECT_INTERVAL_MS,
  BACKEND_IDLE_DISCONNECT_TIMEOUT_MS,
  appendAppDiagnostic,
} = require('../../src/main/ipc.cjs');

describe('ipc.cjs bridge lifecycle/config', () => {
  registerBridgeSuiteLifecycleHooks();

  async function waitForSocket(getWs, attempts = 20) {
    let ws = getWs();
    for (let attempt = 0; !ws && attempt < attempts; attempt += 1) {
      await new Promise((resolve) => queueMicrotask(resolve));
      ws = getWs();
    }
    return ws;
  }

  function invokeAgentSdkCommandHandler(handlers, command, payload = {}, sender = null) {
    return handlers['windie:invoke']({ sender }, {
      command,
      payload,
    });
  }

  function sendQuery(handlers, payload = {}, sender = null) {
    return invokeAgentSdkCommandHandler(handlers, 'conversation.send', payload, sender);
  }

  afterEach(() => {
    setActiveDisplayAffinity(null);
  });

  async function beginBackendConnection(bridge, message = { type: 'list-models' }) {
    const pending = Promise.resolve(
      invokeAgentSdkCommandHandler(bridge.handlers, 'models.list', message),
    ).catch((error) => error);
    const ws = await waitForSocket(() => bridge.getWs());
    expect(ws).not.toBeNull();
    return { pending, ws };
  }

  async function setupOpenedIpc(options = {}) {
    const bridge = initIpc(options);
    const { pending, ws } = await beginBackendConnection(bridge);
    ws.triggerOpen();
    await pending;
    return { ...bridge, ws };
  }

  function emitBackendMessage(ws, payload) {
    ws.handlers.message(JSON.stringify(payload));
  }

  async function waitForSentMessageType(ws, type, attempts = 100) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const message = ws.sent
        .map((entry) => JSON.parse(entry))
        .find((entry) => entry.type === type);
      if (message) {
        return message;
      }
      await Promise.resolve();
      await Promise.resolve();
    }
    return null;
  }

  async function expectClientEndpoints(handlers, runtimeWsUrl, runtimeHttpUrl) {
    const clientInfo = await handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      runtimeWsUrl,
      runtimeHttpUrl,
    }));
  }

  async function invokeLoadDesktopUiConfig(handlers) {
    return handlers['load-frontend-config']();
  }

  function mockDesktopUiConfigFile(fs, content) {
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue(content);
    fs.readFileSync.mockReturnValue(content);
  }

  test('does not create the backend websocket during ipc initialization', () => {
    const bridge = initIpc();

    expect(bridge.ws).toBeNull();
  });

  test('exports the app diagnostic sink used by Electron main composition', () => {
    expect(typeof appendAppDiagnostic).toBe('function');
  });

  test('does not expose a user id before backend auth has been established', async () => {
    const bridge = initIpc();

    const clientInfo = await bridge.handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      userId: null,
      isConnected: false,
    }));
  });

  test('shutdown clears process-global client state for same-module reuse', async () => {
    const bridge = initIpc();

    bridge.ipc.updateGlobalAgentStopShortcutStatus({
      requestedAccelerator: 'CommandOrControl+Alt+.',
      resolvedAccelerator: 'CommandOrControl+Alt+.',
      registrationFailed: true,
    });
    expect(await bridge.handlers['get-client-user-id']()).toEqual(expect.objectContaining({
      globalAgentStopShortcutStatus: expect.objectContaining({
        registrationFailed: true,
      }),
    }));

    bridge.ipc.shutdownIpcForTests();

    expect(await bridge.handlers['get-client-user-id']()).toEqual(expect.objectContaining({
      userId: null,
      sessionId: null,
      conversationRef: null,
      serverUserId: null,
      isConnected: false,
      globalAgentStopShortcutStatus: null,
    }));
  });

  test('sends handshake on websocket open with server-issued user_id', async () => {
    const { ws } = await setupOpenedIpc();

    const handshake = JSON.parse(ws.sent[0]);
    expect(handshake.type).toBe('handshake');
    expect(handshake.user_id).toBe('registered-user-1');
    const manifestToolNames = handshake.agent_definition?.tools?.client_manifest?.tools
      ?.map((tool) => tool.name);
    expect(Array.isArray(manifestToolNames)).toBe(true);
    expect(handshake.available_coordinate_methods).toBeUndefined();
    expect(handshake.agent_definition?.runtime?.coordinate_methods).toBeUndefined();
  });

  test('connects before sending models.list through the SDK runtime', async () => {
    const bridge = initIpc();

    const pendingRequest = invokeAgentSdkCommandHandler(bridge.handlers, 'models.list', { type: 'list-models' });
    const pendingSocket = await waitForSocket(() => bridge.getWs());
    expect(pendingSocket.sent).toHaveLength(0);

    pendingSocket.triggerOpen();
    await pendingRequest;

    expect(pendingSocket.sent).toHaveLength(2);
    expect(JSON.parse(pendingSocket.sent[0])).toEqual(expect.objectContaining({
      type: 'handshake',
    }));
    expect(JSON.parse(pendingSocket.sent[1])).toEqual(expect.objectContaining({
      type: 'list-models',
      payload: {},
      user_id: 'registered-user-1',
    }));
  });

  test('exposes current conversation and session metadata in get-client-user-id snapshot', async () => {
    const { handlers, ws } = await setupOpenedIpc();
    emitBackendMessage(ws, {
      type: 'streaming-response',
      conversation_ref: 'conv-snapshot-1',
      session_id: 'session-snapshot-1',
      user_id: 'server-user-1',
    });

    const clientInfo = await handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      conversationRef: 'conv-snapshot-1',
      sessionId: 'session-snapshot-1',
      serverUserId: 'server-user-1',
    }));
  });

  test('keeps renderer endpoint snapshots generic while VM worker connection state stays backend-shaped', async () => {
    const { handlers, ipc } = await setupOpenedIpc();

    const clientInfo = await handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      runtimeWsUrl: 'wss://api.windieos.com/ws',
      runtimeHttpUrl: 'https://api.windieos.com',
    }));
    expect(clientInfo).not.toHaveProperty('backendWsUrl');
    expect(clientInfo).not.toHaveProperty('backendHttpUrl');

    expect(ipc.getBackendConnectionState()).toEqual(expect.objectContaining({
      backendWsUrl: 'wss://api.windieos.com/ws',
      backendHttpUrl: 'https://api.windieos.com',
    }));
  });

  test('includes global stop shortcut status in IPC snapshots after runtime updates', async () => {
    const { handlers, mainWindow, ipc } = await setupOpenedIpc();

    ipc.updateGlobalAgentStopShortcutStatus({
      requestedAccelerator: 'CommandOrControl+Alt+.',
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      registeredAccelerator: 'CommandOrControl+Shift+.',
      usingFallback: true,
      registrationFailed: false,
      supportedAccelerators: [
        'CommandOrControl+Alt+.',
        'CommandOrControl+Shift+.',
      ],
    });

    const clientInfo = await handlers['get-client-user-id']();
    expect(clientInfo.globalAgentStopShortcutStatus).toEqual(expect.objectContaining({
      usingFallback: true,
      resolvedAccelerator: 'CommandOrControl+Shift+.',
    }));
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'ipc-status',
      expect.objectContaining({
        globalAgentStopShortcutStatus: expect.objectContaining({
          usingFallback: true,
          resolvedAccelerator: 'CommandOrControl+Shift+.',
        }),
      }),
    );
  });

  test('keeps dashboard-selected conversation for chat-pill send after dashboard handoff', async () => {
    const { handlers, ws, mainWindow, backendBridge, ipc } = await setupOpenedIpc();
    primeQueryContext(backendBridge);

    const chatPillWindow = {
      on: jest.fn(),
      isDestroyed: jest.fn(() => false),
      webContents: {
        send: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
        isLoadingMainFrame: jest.fn(() => false),
        getURL: jest.fn(() => 'http://localhost:5173/?view=minimal-chat-pill'),
      },
    };
    ipc.registerRendererWindow(chatPillWindow);

    // Dashboard renderer selects a conversation before close/handoff to chat pill.
    handlers['transcript-session-sync'](
      { sender: mainWindow.webContents },
      { conversationRef: 'conv-dashboard-selected', userId: 'user-dashboard' },
    );

    const dashboardSyncCalls = mainWindow.webContents.send.mock.calls
      .filter(([channel]) => channel === 'transcript-session-sync');
    expect(dashboardSyncCalls).toEqual([]);

    const chatPillSyncCalls = chatPillWindow.webContents.send.mock.calls
      .filter(([channel]) => channel === 'transcript-session-sync');
    expect(chatPillSyncCalls).toEqual([
      ['transcript-session-sync', {
        conversationRef: 'conv-dashboard-selected',
        userId: 'user-dashboard',
      }],
    ]);

    // Dashboard closes; chat pill sends query with explicit conversation_ref from
    // its synchronized SDK conversation session.
    await sendQuery(handlers, {
      text: 'follow-up with explicit conversation ref',
      conversation_ref: 'conv-dashboard-selected',
    }, chatPillWindow.webContents);

    const sentQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentQuery.type).toBe('query');
    expect(sentQuery.payload.conversation_ref).toBe('conv-dashboard-selected');
  });

  test('stores, broadcasts, replays, and clears pending turn state', () => {
    const { handlers, mainWindow, ipc } = initIpc();
    const pendingTurn = {
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'start now',
      timestamp: '2026-06-16T00:00:00.000Z',
    };

    handlers['windie:pending-turn']({}, {
      type: 'pending',
      pendingTurn,
    });

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'pending',
      pendingTurn: expect.objectContaining(pendingTurn),
    });

    const replayWindow = {
      on: jest.fn(),
      isDestroyed: jest.fn(() => false),
      webContents: {
        send: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
        isLoadingMainFrame: jest.fn(() => false),
      },
    };
    ipc.registerRendererWindow(replayWindow);

    expect(replayWindow.webContents.send).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'pending',
      pendingTurn: expect.objectContaining(pendingTurn),
    });

    mainWindow.webContents.send.mockClear();
    replayWindow.webContents.send.mockClear();
    handlers['windie:pending-turn']({}, {
      type: 'clear',
      conversation_ref: 'conv-pending',
      turn_ref: 'turn-pending',
    });
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
    expect(replayWindow.webContents.send).not.toHaveBeenCalled();

    handlers['windie:pending-turn']({}, {
      type: 'clear',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
    });

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
    });
    expect(replayWindow.webContents.send).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
    });

    const afterClearWindow = {
      on: jest.fn(),
      isDestroyed: jest.fn(() => false),
      webContents: {
        send: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
        isLoadingMainFrame: jest.fn(() => false),
      },
    };
    ipc.registerRendererWindow(afterClearWindow);

    expect(afterClearWindow.webContents.send).not.toHaveBeenCalledWith(
      'windie:pending-turn',
      expect.anything(),
    );
  });

  test('switches response overlay phase to tool-call when backend emits tool-call', async () => {
    const applyResponseOverlayPhase = jest.fn();
    const { ws } = await setupOpenedIpc({ applyResponseOverlayPhase });
    emitBackendMessage(ws, { type: 'tool-call', payload: {} });

    expect(applyResponseOverlayPhase).toHaveBeenCalledWith({
      phase: 'tool-call',
      source: 'backend',
      recovery_stage: 'tool-call',
    });
  });

  test('leaves backend tool-call execution to the SDK runtime instead of the Electron bridge', async () => {
    const { ws, backendBridge } = await setupOpenedIpc();
    backendBridge.executeToolForBackend.mockClear();

    emitBackendMessage(ws, {
      id: 'event-tool-call-sdk-runtime',
      type: 'tool-call',
      payload: {
        tool_name: 'save_note',
        request_id: 'req-save-note',
        parameters: { text: 'hello' },
      },
    });

    await Promise.resolve();
    expect(backendBridge.executeToolForBackend).not.toHaveBeenCalled();
  });

  test('does not execute backend-owned tool-call events already marked skip_local_execution', async () => {
    const { ws, backendBridge } = await setupOpenedIpc();
    backendBridge.executeToolForBackend.mockClear();

    emitBackendMessage(ws, {
      id: 'event-backend-owned-tool',
      type: 'tool-call',
      payload: {
        tool_name: 'backend_only_tool',
        request_id: 'req-backend-owned',
        parameters: {},
        metadata: { skip_local_execution: true },
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(backendBridge.executeToolForBackend).not.toHaveBeenCalled();
    expect(ws.sent.map((entry) => JSON.parse(entry)).some((entry) => (
      entry.type === 'tool-result'
      && entry.payload?.request_id === 'req-backend-owned'
    ))).toBe(false);
  });

  test('switches response overlay phase to tool-output after tool-output', async () => {
    const applyResponseOverlayPhase = jest.fn();
    const { ws } = await setupOpenedIpc({ applyResponseOverlayPhase });
    emitBackendMessage(ws, { type: 'tool-call', payload: {} });
    emitBackendMessage(ws, { type: 'tool-output', payload: {} });

    expect(applyResponseOverlayPhase).toHaveBeenNthCalledWith(1, {
      phase: 'tool-call',
      source: 'backend',
      recovery_stage: 'tool-call',
    });
    expect(applyResponseOverlayPhase).toHaveBeenNthCalledWith(2, {
      phase: 'tool-output',
      source: 'backend',
      recovery_stage: 'tool-output',
    });
  });

  test('switches response overlay phase to tool-call when backend emits web-search-progress', async () => {
    const applyResponseOverlayPhase = jest.fn();
    const { ws } = await setupOpenedIpc({ applyResponseOverlayPhase });
    emitBackendMessage(ws, {
      type: 'web-search-progress',
      payload: { request_id: 'req-web-search-progress-1' },
    });

    expect(applyResponseOverlayPhase).toHaveBeenCalledWith({
      phase: 'tool-call',
      source: 'backend',
      recovery_stage: 'tool-call',
      correlation_id: 'req-web-search-progress-1',
    });
  });

  test('preserves active display affinity across backend websocket close', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0);
    setActiveDisplayAffinity({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });
    const { ws } = await setupOpenedIpc();

    ws.handlers.close();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), BACKEND_RECONNECT_INTERVAL_MS);

    expect(getActiveDisplayAffinity()).toEqual({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });
    setTimeoutSpy.mockRestore();
  });

  test('includes overlay recovery metadata for tool-call phase events when available', async () => {
    const applyResponseOverlayPhase = jest.fn();
    const { ws } = await setupOpenedIpc({ applyResponseOverlayPhase });
    emitBackendMessage(ws, {
      id: 'event-tool-call-1',
      type: 'tool-call',
      payload: {
        request_id: 'req-tool-1',
        metadata: {
          attempt: 2,
          max_attempts: 5,
          failure_reason: 'focus_retrying',
        },
      },
    });

    expect(applyResponseOverlayPhase).toHaveBeenCalledWith({
      phase: 'tool-call',
      source: 'backend',
      correlation_id: 'req-tool-1',
      attempt: 2,
      max_attempts: 5,
      recovery_stage: 'tool-call',
      failure_reason: 'focus_retrying',
    });
  });

  test('sends conversation.stop through the SDK runtime', async () => {
    const { handlers, ws } = await setupOpenedIpc();

    const result = await invokeAgentSdkCommandHandler(handlers, 'conversation.stop', {
      conversation_ref: 'conv-typed-stop',
      turn_ref: 'turn-typed-stop',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        ok: true,
        stopped: true,
      },
    });
    const sentStopQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentStopQuery.type).toBe('stop-query');
    expect(sentStopQuery.payload).toEqual({
      conversation_ref: 'conv-typed-stop',
      turn_ref: 'turn-typed-stop',
    });
  });

  test('rejects removed camelCase conversation.stop aliases at main boundary', async () => {
    const { handlers, ws } = await setupOpenedIpc();
    const sentBefore = ws.sent.length;

    await expect(invokeAgentSdkCommandHandler(handlers, 'conversation.stop', {
      conversationRef: 'conv-camel-stop',
      turn_ref: 'turn-stop',
    })).resolves.toEqual({
      ok: false,
      error: 'Agent runtime transport command requires conversation_ref; conversationRef is not supported.',
    });
    await expect(invokeAgentSdkCommandHandler(handlers, 'conversation.stop', {
      conversation_ref: 'conv-stop',
      turnRef: 'turn-camel-stop',
    })).resolves.toEqual({
      ok: false,
      error: 'Agent runtime transport command requires turn_ref; turnRef is not supported.',
    });

    expect(ws.sent).toHaveLength(sentBefore);
  });

  test('internal stop bridge ignores removed turnRef alias', async () => {
    const { ws, ipc } = await setupOpenedIpc();

    await expect(ipc.stopQueryThroughAgentSdkRuntime({
      conversation_ref: 'conv-stop-alias',
      turnRef: 'turn-removed-alias',
    })).resolves.toBe(true);

    const sentStopQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentStopQuery.type).toBe('stop-query');
    expect(sentStopQuery.payload).toEqual({
      conversation_ref: 'conv-stop-alias',
      turn_ref: null,
    });
  });

  test('rejects typed query invokes with missing payload object without throwing', async () => {
    const { handlers, ws, backendBridge } = await setupOpenedIpc();
    primeQueryContext(backendBridge);

    await sendQuery(handlers);

    expect(ws.sent.map((entry) => JSON.parse(entry).type)).not.toContain('query');
  });

  test('enables and disables the global stop shortcut based on active loop phases', async () => {
    const setAgentLoopStopShortcutEnabled = jest.fn();
    const { handlers, ws, backendBridge, mainWindow } = await setupOpenedIpc({
      setAgentLoopStopShortcutEnabled,
    });
    primeQueryContext(backendBridge);

    await sendQuery(handlers, {
      text: 'stop shortcut lifecycle',
      conversation_ref: 'conv-stop-shortcut',
    }, mainWindow.webContents);

    expect(setAgentLoopStopShortcutEnabled).toHaveBeenLastCalledWith(true);

    emitBackendMessage(ws, {
      type: 'streaming-complete',
      conversation_ref: 'conv-stop-shortcut',
      turn_ref: 'turn-stop-shortcut',
      payload: { final_response: 'done' },
    });

    expect(setAgentLoopStopShortcutEnabled).toHaveBeenLastCalledWith(false);
  });

  test('global stop shortcut sends stop-query through the active conversation context', async () => {
    const setAgentLoopStopShortcutEnabled = jest.fn();
    const { handlers, ws, backendBridge, mainWindow, ipc } = await setupOpenedIpc({
      setAgentLoopStopShortcutEnabled,
    });
    primeQueryContext(backendBridge);

    await sendQuery(handlers, {
      text: 'query before global stop',
      conversation_ref: 'conv-global-stop',
    }, mainWindow.webContents);

    const stopTriggered = await ipc.triggerStopQueryFromMain();
    expect(stopTriggered).toBe(true);

    const sentStopQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentStopQuery.type).toBe('stop-query');
    expect(sentStopQuery.payload).toEqual({
      conversation_ref: 'conv-global-stop',
      turn_ref: 'uuid-1',
    });
    expect(setAgentLoopStopShortcutEnabled).toHaveBeenLastCalledWith(false);
  });

  test('global stop shortcut prioritizes current turn over pending turn', async () => {
    const { handlers, ws, backendBridge, mainWindow, ipc } = await setupOpenedIpc();
    primeQueryContext(backendBridge);

    await sendQuery(handlers, {
      text: 'query before global stop',
      conversation_ref: 'conv-global-current',
    }, mainWindow.webContents);
    handlers['windie:pending-turn']({}, {
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-global-pending',
        turnRef: 'turn-global-pending',
        userMessageId: 'user-global-pending',
        text: 'pending stop',
        timestamp: '2026-06-16T00:00:00.000Z',
      },
    });

    const stopTriggered = await ipc.triggerStopQueryFromMain();
    expect(stopTriggered).toBe(true);

    const sentStopQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentStopQuery.type).toBe('stop-query');
    expect(sentStopQuery.payload).toEqual({
      conversation_ref: 'conv-global-current',
      turn_ref: 'uuid-1',
    });
  });

  test('global stop shortcut stops pending turn and broadcasts pending clear', async () => {
    const { handlers, ws, mainWindow, ipc } = await setupOpenedIpc();
    const pendingTurn = {
      conversationRef: 'conv-global-pending',
      turnRef: 'turn-global-pending',
      userMessageId: 'user-global-pending',
      text: 'pending stop',
      timestamp: '2026-06-16T00:00:00.000Z',
    };
    handlers['windie:pending-turn']({}, {
      type: 'pending',
      pendingTurn,
    });

    const stopTriggered = await ipc.triggerStopQueryFromMain();
    expect(stopTriggered).toBe(true);

    const sentStopQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentStopQuery.type).toBe('stop-query');
    expect(sentStopQuery.payload).toEqual({
      conversation_ref: 'conv-global-pending',
      turn_ref: 'turn-global-pending',
    });
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-global-pending',
      turnRef: 'turn-global-pending',
    });
  });

  test('uses BACKEND_HOST and BACKEND_PORT for websocket + http endpoint metadata', async () => {
    process.env.BACKEND_HOST = '10.0.0.42';
    process.env.BACKEND_PORT = '9001';

    const bridge = initIpc();
    const { ws } = await beginBackendConnection(bridge);
    expect(ws.url).toBe('ws://10.0.0.42:9001/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'http://10.0.0.42:9001' }));

    await expectClientEndpoints(bridge.handlers, 'ws://10.0.0.42:9001/ws', 'http://10.0.0.42:9001');
  });

  test('uses hosted backend defaults first for customer-mode desktop runs', async () => {
    const bridge = initIpc();
    const { ws } = await beginBackendConnection(bridge);
    expect(ws.url).toBe('wss://api.windieos.com/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://api.windieos.com' }));

    await expectClientEndpoints(bridge.handlers, 'wss://api.windieos.com/ws', 'https://api.windieos.com');
  });

  test('does not fall back to a local backend when the hosted default is unreachable before open', async () => {
    const bridge = initIpc();
    await beginBackendConnection(bridge);
    const WebSocketMock = require('ws');
    const remoteSocket = WebSocketMock.instances[0];

    remoteSocket.handlers.error({ message: 'connect ECONNREFUSED api.windieos.com' });

    expect(WebSocketMock.instances).toHaveLength(1);
    await expectClientEndpoints(bridge.handlers, 'wss://api.windieos.com/ws', 'https://api.windieos.com');
  });

  test('derives websocket URL from BACKEND_HTTP_URL when explicit ws url is absent', async () => {
    process.env.BACKEND_HTTP_URL = 'https://backend.example.com/';

    const bridge = initIpc();
    const { ws } = await beginBackendConnection(bridge);
    expect(ws.url).toBe('wss://backend.example.com/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://backend.example.com' }));

    await expectClientEndpoints(bridge.handlers, 'wss://backend.example.com/ws', 'https://backend.example.com');
  });

  test('uses hosted backend defaults first when app is packaged', async () => {
    const bridge = initIpc({ isPackaged: true });
    const { ws } = await beginBackendConnection(bridge);
    expect(ws.url).toBe('wss://api.windieos.com/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://api.windieos.com' }));

    await expectClientEndpoints(bridge.handlers, 'wss://api.windieos.com/ws', 'https://api.windieos.com');
  });

  test('does not fall back to a local backend when the packaged hosted default is unreachable before open', async () => {
    const bridge = initIpc({ isPackaged: true });
    await beginBackendConnection(bridge);
    const WebSocketMock = require('ws');
    const remoteSocket = WebSocketMock.instances[0];

    remoteSocket.handlers.error({ message: 'connect ECONNREFUSED api.windieos.com' });

    expect(WebSocketMock.instances).toHaveLength(1);
    await expectClientEndpoints(bridge.handlers, 'wss://api.windieos.com/ws', 'https://api.windieos.com');
  });

  test('uses canonical hosted default backend env override when app is packaged', async () => {
    process.env.WINDIE_DEFAULT_BACKEND_HTTP_URL = 'https://hosted.backend.example/v1/';
    const bridge = initIpc({ isPackaged: true });
    const { ws } = await beginBackendConnection(bridge);
    expect(ws.url).toBe('wss://hosted.backend.example/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://hosted.backend.example/v1' }));

    await expectClientEndpoints(
      bridge.handlers,
      'wss://hosted.backend.example/ws',
      'https://hosted.backend.example/v1',
    );
  });

  test('closes an idle backend websocket after the 30 minute grace window', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0);
    const bridge = initIpc();
    const { pending, ws } = await beginBackendConnection(bridge);

    ws.triggerOpen();
    await pending;

    const idleTimeoutCall = setTimeoutSpy.mock.calls.find(([, delay]) => (
      delay === BACKEND_IDLE_DISCONNECT_TIMEOUT_MS
    ));
    expect(idleTimeoutCall).toBeDefined();

    idleTimeoutCall[0]();

    expect(ws.readyState).toBe(3);
    expect(bridge.mainWindow.webContents.send).toHaveBeenCalledWith(
      'ipc-status',
      expect.objectContaining({ isConnected: false }),
    );
    setTimeoutSpy.mockRestore();
  });

  test('does not schedule reconnect after the idle timeout closes the websocket', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0);
    const bridge = initIpc();
    const { pending, ws } = await beginBackendConnection(bridge);

    ws.triggerOpen();
    await pending;

    const idleTimeoutCall = setTimeoutSpy.mock.calls.find(([, delay]) => (
      delay === BACKEND_IDLE_DISCONNECT_TIMEOUT_MS
    ));
    expect(idleTimeoutCall).toBeDefined();

    idleTimeoutCall[0]();

    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), BACKEND_RECONNECT_INTERVAL_MS);
    setTimeoutSpy.mockRestore();
  });

  test('load-frontend-config returns null when file missing', async () => {
    const { handlers } = initIpc();
    const result = await invokeLoadDesktopUiConfig(handlers);
    expect(result).toBeNull();
  });

  test('load-frontend-config returns parsed config when file exists', async () => {
    const { handlers, fs } = initIpc();
    mockDesktopUiConfigFile(fs, '{"model_mode":"offline"}');

    const result = await invokeLoadDesktopUiConfig(handlers);

    expect(result).toEqual({ model_mode: 'offline' });
  });

  test('load-frontend-config redacts provider secrets and drops stale OAuth from disk config', async () => {
    const { handlers, fs } = initIpc();
    mockDesktopUiConfigFile(fs, JSON.stringify({
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-disk-openai' },
      },
      provider_oauth: {
        openai_codex: {
          connected: true,
          access_token: 'disk-access',
          refresh_token: 'disk-refresh',
          profile_id: 'openai-codex:default',
        },
      },
    }));

    const result = await invokeLoadDesktopUiConfig(handlers);

    expect(result).toEqual({
      provider_api_keys: {
        openai: { enabled: true, api_key: '', has_saved_key: false },
      },
    });
  });

  test('load-frontend-config returns null for invalid JSON', async () => {
    const { handlers, fs } = initIpc();
    mockDesktopUiConfigFile(fs, '{bad json');

    const result = await invokeLoadDesktopUiConfig(handlers);

    expect(result).toBeNull();
  });

  test('load-frontend-config returns null for non-object payload', async () => {
    const { handlers, fs } = initIpc();
    mockDesktopUiConfigFile(fs, '[]');

    const result = await invokeLoadDesktopUiConfig(handlers);

    expect(result).toBeNull();
  });

  test('save-frontend-config rejects invalid payload', async () => {
    const { handlers, fs } = initIpc();

    const result = await handlers['save-frontend-config'](null, null);

    expect(result).toEqual({ success: false, error: 'Invalid config payload' });
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });

  test('save-frontend-config writes file and renames temp path', async () => {
    const setGlobalAgentStopShortcutAccelerator = jest.fn();
    const { handlers, fs } = initIpc({ setGlobalAgentStopShortcutAccelerator });
    const appDataPath = path.join(path.sep, 'tmp', 'appdata');
    const configPath = path.join(appDataPath, 'frontend-config.json');

    const result = await handlers['save-frontend-config'](null, {
      model_mode: 'online',
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
    });

    expect(result).toEqual({ success: true });
    expect(fs.promises.mkdir.mock.calls).toEqual([
      [appDataPath, { recursive: true }],
    ]);
    expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
    const [tempConfigPath, serializedConfig, encoding] = fs.promises.writeFile.mock.calls[0];
    expect(tempConfigPath).toMatch(/frontend-config\.json\.\d+\.\d+\.\d+\.tmp$/);
    expect(serializedConfig).toBe(JSON.stringify({
      model_mode: 'online',
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
    }, null, 2));
    expect(encoding).toBe('utf-8');
    expect(fs.promises.rename.mock.calls).toEqual([
      [tempConfigPath, configPath],
    ]);
    expect(setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith('CommandOrControl+Alt+.');
  });

  test('save-frontend-config preserves existing MCP enablement from stale renderer payloads', async () => {
    const { handlers, fs } = initIpc();
    const appDataPath = path.join(path.sep, 'tmp', 'appdata');
    const configPath = path.join(appDataPath, 'frontend-config.json');
    mockDesktopUiConfigFile(fs, JSON.stringify({
      speech_mode_enabled: false,
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    }));
    await invokeLoadDesktopUiConfig(handlers);
    fs.promises.writeFile.mockClear();
    fs.promises.rename.mockClear();

    const result = await handlers['save-frontend-config'](null, {
      model_mode: 'online',
      agent_enabled_mcp_servers: [],
    });

    expect(result).toEqual({ success: true });
    const [tempConfigPath, serializedConfig] = fs.promises.writeFile.mock.calls[0];
    expect(JSON.parse(serializedConfig)).toEqual({
      model_mode: 'online',
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    });
    expect(fs.promises.rename.mock.calls).toEqual([
      [tempConfigPath, configPath],
    ]);
  });

  test('save-frontend-config preserves disk MCP enablement before config has loaded', async () => {
    const { handlers, fs } = initIpc();
    const appDataPath = path.join(path.sep, 'tmp', 'appdata');
    const configPath = path.join(appDataPath, 'frontend-config.json');
    mockDesktopUiConfigFile(fs, JSON.stringify({
      model_mode: 'online',
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    }));

    const result = await handlers['save-frontend-config'](null, {
      model_mode: 'online',
      browser_automation_enabled: true,
    });

    expect(result).toEqual({ success: true });
    const [tempConfigPath, serializedConfig] = fs.promises.writeFile.mock.calls[0];
    expect(JSON.parse(serializedConfig)).toEqual({
      model_mode: 'online',
      browser_automation_enabled: true,
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    });
    expect(fs.promises.rename.mock.calls).toEqual([
      [tempConfigPath, configPath],
    ]);
  });

  test('save-frontend-config redacts provider secrets and drops stale OAuth before writing disk config', async () => {
    const { handlers, fs } = initIpc();
    const appDataPath = path.join(path.sep, 'tmp', 'appdata');
    const configPath = path.join(appDataPath, 'frontend-config.json');

    const result = await handlers['save-frontend-config'](null, {
      provider_api_keys: {
        openai: { enabled: true, api_key: 'sk-write-openai' },
      },
      provider_oauth: {
        openai_codex: {
          connected: true,
          access_token: 'write-access',
          refresh_token: 'write-refresh',
          profile_id: 'openai-codex:default',
        },
      },
    });

    expect(result).toEqual({ success: true });
    const written = fs.promises.writeFile.mock.calls
      .map((call) => call[1])
      .find((payload) => typeof payload === 'string' && payload.includes('"api_key": ""'));
    expect(written).toBe(JSON.stringify({
      provider_api_keys: {
        openai: { enabled: true, api_key: '', has_saved_key: true },
      },
    }, null, 2));
    expect(written).not.toContain('sk-write-openai');
    expect(written).not.toContain('write-access');
    expect(written).not.toContain('write-refresh');
    const tempConfigPath = fs.promises.writeFile.mock.calls
      .find((call) => typeof call[1] === 'string' && call[1].includes('"api_key": ""'))[0];
    expect(tempConfigPath).toMatch(/frontend-config\.json\.\d+\.\d+\.\d+\.tmp$/);
    expect(fs.promises.rename.mock.calls).toContainEqual(
      [
        tempConfigPath,
        configPath,
      ],
    );
  });
});
