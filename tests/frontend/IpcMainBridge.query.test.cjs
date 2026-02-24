/** @jest-environment node */

const {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');

describe('ipc.cjs bridge query handling', () => {
  registerBridgeSuiteLifecycleHooks();

  test('runs overlay pre-capture hook for chatbox-origin query sends', async () => {
    const onBeforeOverlayQueryCapture = jest.fn().mockResolvedValue(undefined);
    const { handlers, ws, backendBridge } = initIpc({ onBeforeOverlayQueryCapture });
    ws.triggerOpen();
    primeQueryContext(backendBridge);

    await handlers['to-backend']({
      sender: {
        getURL: () => 'http://localhost:5173/?view=chatbox',
      },
    }, {
      type: 'query',
      payload: { text: 'overlay query' },
    });

    expect(onBeforeOverlayQueryCapture).toHaveBeenCalledTimes(1);
  });

  test('skips overlay pre-capture hook for dashboard-origin query sends', async () => {
    const onBeforeOverlayQueryCapture = jest.fn().mockResolvedValue(undefined);
    const { handlers, ws, backendBridge } = initIpc({ onBeforeOverlayQueryCapture });
    ws.triggerOpen();
    primeQueryContext(backendBridge);

    await handlers['to-backend']({
      sender: {
        getURL: () => 'http://localhost:5173/',
      },
    }, {
      type: 'query',
      payload: { text: 'dashboard query' },
    });

    expect(onBeforeOverlayQueryCapture).not.toHaveBeenCalled();
  });

  test('emits renderer error event when query send fails due to disconnected backend', async () => {
    const { handlers, backendBridge, mainWindow } = initIpc();
    primeQueryContext(backendBridge);

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'offline query', conversation_ref: 'conv-offline' },
    });

    const backendEvents = mainWindow.webContents.send.mock.calls
      .filter(([channel]) => channel === 'from-backend')
      .map(([, payload]) => payload);
    const errorEvent = backendEvents.find((eventPayload) => eventPayload?.type === 'error');

    expect(errorEvent).toBeDefined();
    expect(errorEvent.turn_ref).toBe('uuid-1');
    expect(errorEvent.payload.message).toContain('backend connection is unavailable');
  });

  test('builds full query payload with system state + memories', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A', 'B'],
      },
      memoryResult: {
        success: true,
        data: { memories: { episodic: ['e1'], semantic: [] } },
      },
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'hello', conversation_ref: 'conv-1' },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.type).toBe('query');
    expect(lastMessage.payload.conversation_ref).toBe('conv-1');
    expect(lastMessage.payload.content).toContain('<system_context>');
    expect(lastMessage.payload.content).toContain('<episodic_memory>');
    expect(lastMessage.payload.content).toContain('- e1');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(lastMessage.payload.content).toContain('<user_query>\nhello\n</user_query>');
    expect(lastMessage.payload.system_state_internal).toEqual({
      screen_resolution: '1920x1080',
    });
  });

  test('reuses backend conversation_ref fallback for local echo and outbound query payload', async () => {
    const { handlers, ws, backendBridge, mainWindow } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A'],
      },
    });

    ws.handlers.message(JSON.stringify({
      type: 'streaming-response',
      conversation_ref: 'conv-backfill',
    }));

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'follow up without explicit conversation ref' },
    });

    const outgoingQuery = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(outgoingQuery.type).toBe('query');
    expect(outgoingQuery.payload.conversation_ref).toBe('conv-backfill');

    const localUserMessages = mainWindow.webContents.send.mock.calls
      .filter(([channel, payload]) => channel === 'from-backend' && payload?.type === 'local-user-message');
    const latestLocalUserMessage = localUserMessages[localUserMessages.length - 1][1];

    expect(latestLocalUserMessage.conversation_ref).toBe('conv-backfill');
    expect(latestLocalUserMessage.payload.conversation_ref).toBe('conv-backfill');
  });

  test('escapes XML-sensitive query, system state, and memory content', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      systemState: {
        active_window: 'Editor <Main> & Co',
        mouse_position: '10 > 9',
        screen_resolution: '1920x1080',
        windows: ['Main <Window>', 'Side & Panel'],
      },
      memoryResult: {
        success: true,
        data: {
          memories: {
            episodic: ['remember </episodic_memory><hack>1</hack>'],
            semantic: ['semantic <note> & value'],
          },
        },
      },
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: {
        text: 'hello </user_query><hack>1</hack>',
        conversation_ref: 'conv-xml-1',
      },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    const content = lastMessage.payload.content;

    expect(content).toContain('<user_query>\nhello &lt;/user_query&gt;&lt;hack&gt;1&lt;/hack&gt;\n</user_query>');
    expect(content).toContain('<active_window>Editor &lt;Main&gt; &amp; Co</active_window>');
    expect(content).toContain('<mouse_position>10 &gt; 9</mouse_position>');
    expect(content).toContain('<window>Main &lt;Window&gt;</window>');
    expect(content).toContain('<window>Side &amp; Panel</window>');
    expect(content).toContain('- remember &lt;/episodic_memory&gt;&lt;hack&gt;1&lt;/hack&gt;');
    expect(content).toContain('- semantic &lt;note&gt; &amp; value');
    expect(content).not.toContain('<hack>');
  });

  test('strips query screenshot_url before sending to backend', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A'],
      },
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-2',
        screenshot_ref: 'art_123',
        screenshot_url: 'http://localhost:8765/api/artifacts/art_123',
      },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.type).toBe('query');
    expect(lastMessage.payload.conversation_ref).toBe('conv-2');
    expect(lastMessage.payload.screenshot_ref).toBe('art_123');
    expect(lastMessage.payload).not.toHaveProperty('screenshot_url');
  });

  test('builds query with fallback system context on system state error', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      systemStateError: new Error('boom'),
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'hi', conversation_ref: 'conv-3' },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.payload.content).toContain('<active_window>Unknown</active_window>');
    expect(lastMessage.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
  });

  test('builds query with empty memories when search fails', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      memoryError: new Error('fail'),
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'memory fail', conversation_ref: 'conv-4' },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(lastMessage.payload.content).toContain('<user_query>\nmemory fail\n</user_query>');
    expect(lastMessage.payload).not.toHaveProperty('system_state_internal');
  });

  test('builds query with empty memories when search response is malformed', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      memoryResult: {
        success: true,
        data: {},
      },
    });

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'memory malformed', conversation_ref: 'conv-4b' },
    });

    const lastMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastMessage.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(lastMessage.payload.content).toContain('<user_query>\nmemory malformed\n</user_query>');
  });

  test('gates first query behind settings-updated ack when frontend config exists', async () => {
    const { handlers, ws, backendBridge, fs } = initIpc();
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue(JSON.stringify({
      interaction_mode: 'agent',
      model_mode: 'online',
    }));
    ws.triggerOpen();
    primeQueryContext(backendBridge);

    const queryPromise = handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'mode check', conversation_ref: 'conv-5' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ws.sent.length).toBe(2);
    const settingsMessage = JSON.parse(ws.sent[1]);
    expect(settingsMessage.type).toBe('update-settings');
    expect(settingsMessage.payload).toEqual(expect.objectContaining({
      interaction_mode: 'agent',
    }));

    ws.handlers.message(JSON.stringify({
      type: 'settings-updated',
      id: settingsMessage.id,
      payload: { updated_keys: ['interaction_mode'] },
    }));

    await queryPromise;

    const queryMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>\nmode check\n</user_query>');
  });

  test('waits for pending renderer update-settings ack before sending query', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();
    primeQueryContext(backendBridge);

    await handlers['to-backend']({ sender: null }, {
      type: 'update-settings',
      payload: { interaction_mode: 'agent' },
    });

    const updateSettingsMessage = JSON.parse(ws.sent[1]);
    expect(updateSettingsMessage.type).toBe('update-settings');

    const queryPromise = handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'after settings update', conversation_ref: 'conv-6' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(ws.sent[ws.sent.length - 1]).type).toBe('update-settings');

    ws.handlers.message(JSON.stringify({
      type: 'settings-updated',
      id: updateSettingsMessage.id,
      payload: { updated_keys: ['interaction_mode'] },
    }));

    await queryPromise;

    const queryMessage = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>\nafter settings update\n</user_query>');
  });

  test('keeps initial query context after transient query send failure', async () => {
    const { handlers, ws, backendBridge } = initIpc();
    ws.triggerOpen();

    primeQueryContext(backendBridge, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A', 'B'],
      },
    });

    const originalSend = ws.send.bind(ws);
    let failNextQuerySend = true;
    ws.send = (data) => {
      const parsed = JSON.parse(data);
      if (parsed?.type === 'query' && failNextQuerySend) {
        failNextQuerySend = false;
        throw new Error('send failed');
      }
      originalSend(data);
    };

    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'first query', conversation_ref: 'conv-a' },
    });
    await handlers['to-backend']({ sender: null }, {
      type: 'query',
      payload: { text: 'second query', conversation_ref: 'conv-a' },
    });

    expect(backendBridge.getSystemState).toHaveBeenCalledTimes(2);
    expect(backendBridge.getSystemState.mock.calls[0][0]).toEqual([
      'active_window',
      'mouse_position',
      'screen_resolution',
      'windows',
    ]);
    expect(backendBridge.getSystemState.mock.calls[1][0]).toEqual([
      'active_window',
      'mouse_position',
      'screen_resolution',
      'windows',
    ]);
  });

  test('reconnect clears stale conversation ref fallback before next query', async () => {
    jest.useFakeTimers();
    try {
      const { handlers, ws, backendBridge, mainWindow } = initIpc();
      ws.triggerOpen();
      primeQueryContext(backendBridge);

      ws.handlers.message(JSON.stringify({
        type: 'streaming-response',
        conversation_ref: 'conv-stale',
      }));

      ws.readyState = 3;
      ws.handlers.close();
      jest.advanceTimersByTime(5000);

      const WebSocketMock = require('ws');
      const reconnectedSocket = WebSocketMock.instances[1];
      reconnectedSocket.triggerOpen();

      await handlers['to-backend']({ sender: null }, {
        type: 'query',
        payload: { text: 'fresh query after reconnect' },
      });

      const localUserMessages = mainWindow.webContents.send.mock.calls
        .filter(([channel, payload]) => channel === 'from-backend' && payload?.type === 'local-user-message');
      const latestLocalUserMessage = localUserMessages[localUserMessages.length - 1][1];

      expect(latestLocalUserMessage.conversation_ref).toBeNull();
      expect(latestLocalUserMessage.payload.conversation_ref).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
