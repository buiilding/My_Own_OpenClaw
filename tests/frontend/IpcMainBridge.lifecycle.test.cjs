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
} = require('../../frontend/src/main/display_affinity_runtime.cjs');
const {
  BACKEND_RECONNECT_INTERVAL_MS,
  BACKEND_IDLE_DISCONNECT_TIMEOUT_MS,
} = require('../../frontend/src/main/ipc.cjs');

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

  afterEach(() => {
    setActiveDisplayAffinity(null);
  });

  async function beginBackendConnection(bridge, message = { type: 'list-models' }) {
    const pending = bridge.handlers['to-backend']({ sender: null }, message);
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

  async function expectClientEndpoints(handlers, backendWsUrl, backendHttpUrl) {
    const clientInfo = await handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      backendWsUrl,
      backendHttpUrl,
    }));
  }

  async function invokeLoadFrontendConfig(handlers) {
    return handlers['load-frontend-config']();
  }

  function mockFrontendConfigFile(fs, content) {
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue(content);
  }

  test('does not create the backend websocket during ipc initialization', () => {
    const bridge = initIpc();

    expect(bridge.ws).toBeNull();
  });

  test('does not expose a user id before backend auth has been established', async () => {
    const bridge = initIpc();

    const clientInfo = await bridge.handlers['get-client-user-id']();
    expect(clientInfo).toEqual(expect.objectContaining({
      userId: null,
      isConnected: false,
    }));
  });

  test('sends handshake on websocket open with server-issued user_id', async () => {
    const { ws } = await setupOpenedIpc();

    const handshake = JSON.parse(ws.sent[0]);
    expect(handshake.type).toBe('handshake');
    expect(handshake.user_id).toBe('registered-user-1');
    expect(handshake.available_tools).toEqual(expect.arrayContaining([
      'mouse_control',
      'read_file',
      'web_search',
    ]));
    expect(handshake.available_coordinate_methods).toEqual([
      'manual',
      'ocr',
      'prediction',
    ]);
  });

  test('queues list-models requests made before websocket open and flushes them after connect', async () => {
    const bridge = initIpc();

    const pendingRequest = bridge.handlers['to-backend']({ sender: null }, { type: 'list-models' });
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
        getURL: jest.fn(() => 'http://localhost:5173/?view=chatbox'),
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

    // Dashboard closes; chat pill sends query without explicit conversation_ref.
    await handlers['to-backend']({ sender: chatPillWindow.webContents }, {
      type: 'query',
      payload: { text: 'follow-up without explicit conversation ref' },
    });

    const sentQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentQuery.type).toBe('query');
    expect(sentQuery.payload.conversation_ref).toBe('conv-dashboard-selected');
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

  test('ignores malformed to-backend event payloads without crashing', async () => {
    const { handlers, ws } = initIpc();

    await handlers['to-backend']({ sender: null });

    expect(ws).toBeNull();
  });

  test('handles query events with missing payload object without throwing', async () => {
    const { handlers, ws, backendBridge } = await setupOpenedIpc();
    primeQueryContext(backendBridge);

    await handlers['to-backend']({ sender: null }, { type: 'query' });

    const queryMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>');
    expect(queryMessage.payload.content).toContain('</user_query>');
  });

  test('enables and disables the global stop shortcut based on active loop phases', async () => {
    const setAgentLoopStopShortcutEnabled = jest.fn();
    const { handlers, ws, backendBridge, mainWindow } = await setupOpenedIpc({
      setAgentLoopStopShortcutEnabled,
    });
    primeQueryContext(backendBridge);

    await handlers['to-backend']({ sender: mainWindow.webContents }, {
      type: 'query',
      payload: { text: 'stop shortcut lifecycle' },
    });

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

    await handlers['to-backend']({ sender: mainWindow.webContents }, {
      type: 'query',
      payload: { text: 'query before global stop' },
    });

    const stopTriggered = ipc.triggerStopQueryFromMain();
    expect(stopTriggered).toBe(true);

    const sentStopQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentStopQuery.type).toBe('stop-query');
    expect(sentStopQuery.payload).toEqual(expect.any(Object));
    expect(setAgentLoopStopShortcutEnabled).toHaveBeenLastCalledWith(false);
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
    process.env.BACKEND_HTTP_URL = 'https://windie.example.com/';

    const bridge = initIpc();
    const { ws } = await beginBackendConnection(bridge);
    expect(ws.url).toBe('wss://windie.example.com/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://windie.example.com' }));

    await expectClientEndpoints(bridge.handlers, 'wss://windie.example.com/ws', 'https://windie.example.com');
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

  test('uses packaged default backend env override when app is packaged', async () => {
    process.env.WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL = 'https://hosted.windie.example/v1/';
    const bridge = initIpc({ isPackaged: true });
    const { ws } = await beginBackendConnection(bridge);
    expect(ws.url).toBe('wss://hosted.windie.example/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://hosted.windie.example/v1' }));

    await expectClientEndpoints(
      bridge.handlers,
      'wss://hosted.windie.example/ws',
      'https://hosted.windie.example/v1',
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
    const result = await invokeLoadFrontendConfig(handlers);
    expect(result).toBeNull();
  });

  test('load-frontend-config returns parsed config when file exists', async () => {
    const { handlers, fs } = initIpc();
    mockFrontendConfigFile(fs, '{"model_mode":"offline"}');

    const result = await invokeLoadFrontendConfig(handlers);

    expect(result).toEqual({ model_mode: 'offline' });
  });

  test('load-frontend-config returns null for invalid JSON', async () => {
    const { handlers, fs } = initIpc();
    mockFrontendConfigFile(fs, '{bad json');

    const result = await invokeLoadFrontendConfig(handlers);

    expect(result).toBeNull();
  });

  test('load-frontend-config returns null for non-object payload', async () => {
    const { handlers, fs } = initIpc();
    mockFrontendConfigFile(fs, '[]');

    const result = await invokeLoadFrontendConfig(handlers);

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
    const tempConfigPath = path.join(appDataPath, 'frontend-config.json.tmp');
    const configPath = path.join(appDataPath, 'frontend-config.json');

    const result = await handlers['save-frontend-config'](null, {
      model_mode: 'online',
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
    });

    expect(result).toEqual({ success: true });
    expect(fs.promises.mkdir.mock.calls).toEqual([
      [appDataPath, { recursive: true }],
    ]);
    expect(fs.promises.writeFile.mock.calls).toEqual([
      [
        tempConfigPath,
        JSON.stringify({
          model_mode: 'online',
          global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
        }, null, 2),
        'utf-8',
      ],
    ]);
    expect(fs.promises.rename.mock.calls).toEqual([
      [
        tempConfigPath,
        configPath,
      ],
    ]);
    expect(setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith('CommandOrControl+Alt+.');
  });
});
