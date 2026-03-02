/** @jest-environment node */

const {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');

describe('ipc.cjs bridge lifecycle/config', () => {
  registerBridgeSuiteLifecycleHooks();

  function setupOpenedIpc(options = {}) {
    const bridge = initIpc(options);
    bridge.ws.triggerOpen();
    return bridge;
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

  test('sends handshake on websocket open with sanitized user_id', () => {
    const { ws } = setupOpenedIpc();

    expect(ws.sent).toHaveLength(1);
    const handshake = JSON.parse(ws.sent[0]);
    expect(handshake.type).toBe('handshake');
    expect(handshake.user_id).toBe('bad_user_');
  });

  test('keeps dashboard-selected conversation for chat-pill send after dashboard handoff', async () => {
    const { handlers, ws, mainWindow, backendBridge, ipc } = setupOpenedIpc();
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

  test('switches response overlay phase to tool-call when backend emits tool-call', () => {
    const onResponseOverlayPhaseChange = jest.fn();
    const { ws } = setupOpenedIpc({ onResponseOverlayPhaseChange });
    emitBackendMessage(ws, { type: 'tool-call', payload: {} });

    expect(onResponseOverlayPhaseChange).toHaveBeenCalledWith({
      phase: 'tool-call',
      source: 'backend',
      recovery_stage: 'tool-call',
    });
  });

  test('switches response overlay phase to tool-output after tool-output', () => {
    const onResponseOverlayPhaseChange = jest.fn();
    const { ws } = setupOpenedIpc({ onResponseOverlayPhaseChange });
    emitBackendMessage(ws, { type: 'tool-call', payload: {} });
    emitBackendMessage(ws, { type: 'tool-output', payload: {} });

    expect(onResponseOverlayPhaseChange).toHaveBeenNthCalledWith(1, {
      phase: 'tool-call',
      source: 'backend',
      recovery_stage: 'tool-call',
    });
    expect(onResponseOverlayPhaseChange).toHaveBeenNthCalledWith(2, {
      phase: 'tool-output',
      source: 'backend',
      recovery_stage: 'tool-output',
    });
  });

  test('includes overlay recovery metadata for tool-call phase events when available', () => {
    const onResponseOverlayPhaseChange = jest.fn();
    const { ws } = setupOpenedIpc({ onResponseOverlayPhaseChange });
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

    expect(onResponseOverlayPhaseChange).toHaveBeenCalledWith({
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
    const { handlers, ws } = setupOpenedIpc();

    await handlers['to-backend']({ sender: null });

    expect(ws.sent).toHaveLength(1);
    const handshake = JSON.parse(ws.sent[0]);
    expect(handshake.type).toBe('handshake');
  });

  test('handles query events with missing payload object without throwing', async () => {
    const { handlers, ws, backendBridge } = setupOpenedIpc();
    primeQueryContext(backendBridge);

    await handlers['to-backend']({ sender: null }, { type: 'query' });

    const queryMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>');
    expect(queryMessage.payload.content).toContain('</user_query>');
  });

  test('uses BACKEND_HOST and BACKEND_PORT for websocket + http endpoint metadata', async () => {
    process.env.BACKEND_HOST = '10.0.0.42';
    process.env.BACKEND_PORT = '9001';

    const { ws, handlers } = initIpc();
    expect(ws.url).toBe('ws://10.0.0.42:9001/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'http://10.0.0.42:9001' }));

    await expectClientEndpoints(handlers, 'ws://10.0.0.42:9001/ws', 'http://10.0.0.42:9001');
  });

  test('derives websocket URL from BACKEND_HTTP_URL when explicit ws url is absent', async () => {
    process.env.BACKEND_HTTP_URL = 'https://windie.example.com/';

    const { ws, handlers } = initIpc();
    expect(ws.url).toBe('wss://windie.example.com/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://windie.example.com' }));

    await expectClientEndpoints(handlers, 'wss://windie.example.com/ws', 'https://windie.example.com');
  });

  test('uses hosted backend defaults when app is packaged', async () => {
    const { ws, handlers } = initIpc({ isPackaged: true });
    expect(ws.url).toBe('wss://api.windieos.com/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://api.windieos.com' }));

    await expectClientEndpoints(handlers, 'wss://api.windieos.com/ws', 'https://api.windieos.com');
  });

  test('uses packaged default backend env override when app is packaged', async () => {
    process.env.WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL = 'https://hosted.windie.example/v1/';
    const { ws, handlers } = initIpc({ isPackaged: true });
    expect(ws.url).toBe('wss://hosted.windie.example/ws');
    expect(ws.options).toEqual(expect.objectContaining({ origin: 'https://hosted.windie.example/v1' }));

    await expectClientEndpoints(
      handlers,
      'wss://hosted.windie.example/ws',
      'https://hosted.windie.example/v1',
    );
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
    const { handlers, fs } = initIpc();

    const result = await handlers['save-frontend-config'](null, { model_mode: 'online' });

    expect(result).toEqual({ success: true });
    expect(fs.promises.mkdir).toHaveBeenCalledWith('/tmp/appdata', { recursive: true });
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      '/tmp/appdata/frontend-config.json.tmp',
      JSON.stringify({ model_mode: 'online' }, null, 2),
      'utf-8',
    );
    expect(fs.promises.rename).toHaveBeenCalledWith(
      '/tmp/appdata/frontend-config.json.tmp',
      '/tmp/appdata/frontend-config.json',
    );
  });
});
