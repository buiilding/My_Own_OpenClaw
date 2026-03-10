/** @jest-environment node */

const {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');

describe('ipc.cjs bridge query handling', () => {
  registerBridgeSuiteLifecycleHooks();

  function setupQueryBridge(initOptions = {}, queryContextOptions = undefined) {
    const bridge = initIpc(initOptions);
    bridge.ws.triggerOpen();
    primeQueryContext(bridge.backendBridge, queryContextOptions);
    return bridge;
  }

  function sendQuery(handlers, payload, sender = null) {
    return handlers['to-backend']({ sender }, {
      type: 'query',
      payload,
    });
  }

  function getLastSentMessage(ws) {
    return JSON.parse(ws.sent[ws.sent.length - 1]);
  }

  function getLatestLocalUserMessage(mainWindow) {
    const localUserMessages = mainWindow.webContents.send.mock.calls
      .filter(([channel, payload]) => channel === 'from-backend' && payload?.type === 'local-user-message');
    return localUserMessages[localUserMessages.length - 1][1];
  }

  function expectQueryContentWithEmptyMemories(content, queryText) {
    expect(content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(content).toContain(`<user_query>\n${queryText}\n</user_query>`);
  }

  function emitSettingsUpdatedAck(ws, messageId) {
    ws.handlers.message(JSON.stringify({
      type: 'settings-updated',
      id: messageId,
      payload: { updated_keys: ['interaction_mode'] },
    }));
  }

  test('runs overlay pre-capture hook for chatbox-origin query sends', async () => {
    const onBeforeOverlayQueryCapture = jest.fn().mockResolvedValue(undefined);
    const { handlers } = setupQueryBridge({ onBeforeOverlayQueryCapture });

    await sendQuery(
      handlers,
      { text: 'overlay query' },
      { getURL: () => 'http://localhost:5173/?view=chatbox' },
    );

    expect(onBeforeOverlayQueryCapture).toHaveBeenCalledTimes(1);
  });

  test('skips overlay pre-capture hook for dashboard-origin query sends', async () => {
    const onBeforeOverlayQueryCapture = jest.fn().mockResolvedValue(undefined);
    const { handlers } = setupQueryBridge({ onBeforeOverlayQueryCapture });

    await sendQuery(
      handlers,
      { text: 'dashboard query' },
      { getURL: () => 'http://localhost:5173/' },
    );

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
    const { handlers, ws } = setupQueryBridge({}, {
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

    await sendQuery(handlers, { text: 'hello', conversation_ref: 'conv-1' });

    const lastMessage = getLastSentMessage(ws);
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

  test('injects attachment context into backend query content and keeps filenames in local echo only', async () => {
    const { handlers, ws, mainWindow } = setupQueryBridge({}, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A', 'B'],
      },
    });

    await sendQuery(handlers, {
      text: 'summarize',
      conversation_ref: 'conv-attachments',
      attachment_context: '--- Attached File: notes.txt ---\nFile path: /tmp/notes.txt',
      attachment_filenames: ['notes.txt'],
    });

    const outgoingQuery = getLastSentMessage(ws);
    expect(outgoingQuery.payload.content).toContain('<attached_file_context>');
    expect(outgoingQuery.payload.content).toContain('--- Attached File: notes.txt ---');
    expect(outgoingQuery.payload.content).toContain('<user_query>\nsummarize\n</user_query>');
    expect(outgoingQuery.payload).not.toHaveProperty('attachment_context');
    expect(outgoingQuery.payload).not.toHaveProperty('attachment_filenames');

    const localUserMessage = getLatestLocalUserMessage(mainWindow);
    expect(localUserMessage.payload.attachment_filenames).toEqual(['notes.txt']);
  });

  test('reuses backend conversation_ref fallback for local echo and outbound query payload', async () => {
    const { handlers, ws, mainWindow } = setupQueryBridge({}, {
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

    await sendQuery(handlers, { text: 'follow up without explicit conversation ref' });

    const outgoingQuery = getLastSentMessage(ws);
    expect(outgoingQuery.type).toBe('query');
    expect(outgoingQuery.payload.conversation_ref).toBe('conv-backfill');

    const latestLocalUserMessage = getLatestLocalUserMessage(mainWindow);

    expect(latestLocalUserMessage.conversation_ref).toBe('conv-backfill');
    expect(latestLocalUserMessage.payload.conversation_ref).toBe('conv-backfill');
  });

  test('seeds active display affinity from visible chat surface instead of hidden sender window', async () => {
    const senderWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      getBounds: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 300 })),
    };
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      getBounds: jest.fn(() => ({ x: 2200, y: 80, width: 520, height: 116 })),
    };

    const { handlers, backendBridge } = setupQueryBridge({ chatWindow });
    const electron = require('electron');
    electron.screen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        id: 2,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      },
    ]);
    electron.screen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    });
    electron.screen.getDisplayMatching.mockImplementation((bounds) => {
      if (bounds && bounds.x >= 1920) {
        return {
          id: 2,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        };
      }
      return {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      };
    });
    electron.BrowserWindow.fromWebContents.mockImplementation(() => senderWindow);
    const {
      getActiveDisplayAffinity,
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/display_affinity_runtime.cjs');
    setActiveDisplayAffinity(null);
    primeQueryContext(backendBridge);

    await sendQuery(
      handlers,
      { text: 'chat surface query' },
      { getURL: () => 'http://localhost:5173/?view=chatbox' },
    );

    const activeDisplayAffinity = getActiveDisplayAffinity();
    if (!activeDisplayAffinity || activeDisplayAffinity.monitor_id !== '2') {
      throw new Error(`Expected monitor_id=2, received ${JSON.stringify(activeDisplayAffinity)}`);
    }
    expect(JSON.stringify(activeDisplayAffinity.bounds)).toBe(JSON.stringify({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1440,
    }));
    expect(JSON.stringify(activeDisplayAffinity.workArea)).toBe(JSON.stringify({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1400,
    }));
    expect(JSON.stringify(activeDisplayAffinity.desktopVirtualBounds)).toBe(JSON.stringify({
      x: 0,
      y: 0,
      width: 4480,
      height: 1440,
    }));
  });

  test('replays in-flight query events to late-mounted renderer windows', async () => {
    const { handlers, ws, ipc } = setupQueryBridge({}, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A'],
      },
    });

    await sendQuery(handlers, { text: 'first turn', conversation_ref: 'conv-replay' });

    ws.handlers.message(JSON.stringify({
      type: 'streaming-response',
      turn_ref: 'uuid-1',
      conversation_ref: 'conv-replay',
      payload: {
        text: 'chunk-1',
      },
    }));

    const lateWindow = {
      isDestroyed: jest.fn(() => false),
      on: jest.fn(),
      webContents: {
        send: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
        isLoadingMainFrame: jest.fn(() => false),
      },
    };
    ipc.registerRendererWindow(lateWindow);

    const replayEvents = lateWindow.webContents.send.mock.calls
      .filter(([channel]) => channel === 'from-backend')
      .map(([, payload]) => payload);
    expect(replayEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'local-user-message',
        turn_ref: 'uuid-1',
      }),
      expect.objectContaining({
        type: 'streaming-response',
        turn_ref: 'uuid-1',
      }),
    ]));
  });

  test('escapes XML-sensitive query, system state, and memory content', async () => {
    const { handlers, ws } = setupQueryBridge({}, {
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

    await sendQuery(handlers, {
      text: 'hello </user_query><hack>1</hack>',
      conversation_ref: 'conv-xml-1',
    });

    const lastMessage = getLastSentMessage(ws);
    const content = lastMessage.payload.content;

    expect(content).toContain('<user_query>\nhello &lt;/user_query&gt;&lt;hack&gt;1&lt;/hack&gt;\n</user_query>');
    expect(content).toContain('<active_window>Editor &lt;Main&gt; &amp; Co</active_window>');
    expect(content).toContain('<mouse_position>10 &gt; 9</mouse_position>');
    expect(content).toContain('- remember &lt;/episodic_memory&gt;&lt;hack&gt;1&lt;/hack&gt;');
    expect(content).toContain('- semantic &lt;note&gt; &amp; value');
    expect(content).not.toContain('<hack>');
  });

  test('strips query screenshot_url before sending to backend', async () => {
    const { handlers, ws, mainWindow } = setupQueryBridge({}, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A'],
      },
    });

    await sendQuery(handlers, {
      text: 'hello',
      conversation_ref: 'conv-2',
      screenshot_ref: 'art_123',
      screenshot_url: 'http://localhost:8765/api/artifacts/art_123',
    });

    const lastMessage = getLastSentMessage(ws);
    expect(lastMessage.type).toBe('query');
    expect(lastMessage.payload.conversation_ref).toBe('conv-2');
    expect(lastMessage.payload.screenshot_ref).toBe('art_123');
    expect(lastMessage.payload).not.toHaveProperty('screenshot_url');

    const localUserMessage = getLatestLocalUserMessage(mainWindow);
    expect(localUserMessage.payload.screenshot_ref).toBe('art_123');
    expect(localUserMessage.payload.screenshot_url).toBe('http://localhost:8765/api/artifacts/art_123');
  });

  test('hydrates local-user-message screenshot_url from screenshot_ref when renderer payload omits url', async () => {
    const { handlers, ws, mainWindow } = setupQueryBridge({}, {
      systemState: {
        active_window: 'App',
        mouse_position: '0,0',
        screen_resolution: '1920x1080',
        windows: ['A'],
      },
    });

    await sendQuery(handlers, {
      text: 'hello',
      conversation_ref: 'conv-2b',
      screenshot_ref: 'art_999',
    });

    const lastMessage = getLastSentMessage(ws);
    expect(lastMessage.type).toBe('query');
    expect(lastMessage.payload.screenshot_ref).toBe('art_999');
    expect(lastMessage.payload).not.toHaveProperty('screenshot_url');

    const localUserMessage = getLatestLocalUserMessage(mainWindow);
    expect(localUserMessage.payload.screenshot_ref).toBe('art_999');
    expect(localUserMessage.payload.screenshot_url).toBe('http://127.0.0.1:8765/api/artifacts/art_999');
  });

  test('strips tool-bundle-result screenshot_url fields before sending to backend', async () => {
    const { handlers, ws } = setupQueryBridge();

    await handlers['to-backend']({ sender: null }, {
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-1',
        status: 'success',
        step_results: [],
        screenshot_ref: 'artifact_ref_1',
        screenshot_url: 'http://localhost:8765/api/artifacts/shot.png',
        screenshot_urls: ['http://localhost:8765/api/artifacts/shot2.png'],
      },
    });

    const lastMessage = getLastSentMessage(ws);
    expect(lastMessage.type).toBe('tool-bundle-result');
    expect(lastMessage.payload).toEqual(expect.objectContaining({
      bundle_id: 'bundle-1',
      status: 'success',
      step_results: [],
      screenshot_ref: 'artifact_ref_1',
    }));
    expect(lastMessage.payload).not.toHaveProperty('screenshot_url');
    expect(lastMessage.payload).not.toHaveProperty('screenshot_urls');
  });

  test('builds query with fallback system context on system state error', async () => {
    const { handlers, ws } = setupQueryBridge({}, {
      systemStateError: new Error('boom'),
    });

    await sendQuery(handlers, { text: 'hi', conversation_ref: 'conv-3' });

    const lastMessage = getLastSentMessage(ws);
    expect(lastMessage.payload.content).toContain('<active_window>Unknown</active_window>');
    expect(lastMessage.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
  });

  test('builds query with empty memories when search fails', async () => {
    const { handlers, ws } = setupQueryBridge({}, {
      memoryError: new Error('fail'),
    });

    await sendQuery(handlers, { text: 'memory fail', conversation_ref: 'conv-4' });

    const lastMessage = getLastSentMessage(ws);
    expectQueryContentWithEmptyMemories(lastMessage.payload.content, 'memory fail');
    expect(lastMessage.payload).not.toHaveProperty('system_state_internal');
  });

  test('builds query with empty memories when search response is malformed', async () => {
    const { handlers, ws } = setupQueryBridge({}, {
      memoryResult: {
        success: true,
        data: {},
      },
    });

    await sendQuery(handlers, { text: 'memory malformed', conversation_ref: 'conv-4b' });

    const lastMessage = getLastSentMessage(ws);
    expectQueryContentWithEmptyMemories(lastMessage.payload.content, 'memory malformed');
  });

  test('skips memory retrieval search and memory tags when retrieval injection is disabled', async () => {
    const { handlers, ws, backendBridge } = setupQueryBridge({}, {
      memoryResult: {
        success: true,
        data: { memories: { episodic: ['should not appear'], semantic: ['should not appear'] } },
      },
    });

    await sendQuery(handlers, {
      text: 'no retrieval',
      conversation_ref: 'conv-no-retrieval',
      memory_retrieval_enabled: false,
    });

    const lastMessage = getLastSentMessage(ws);
    expect(lastMessage.payload.content).toContain('<system_context>');
    expect(lastMessage.payload.content).toContain('<user_query>\nno retrieval\n</user_query>');
    expect(lastMessage.payload.content).not.toContain('<episodic_memory>');
    expect(lastMessage.payload.content).not.toContain('<semantic_memory>');
    expect(lastMessage.payload).not.toHaveProperty('memory_retrieval_enabled');
    expect(backendBridge.searchMemory).not.toHaveBeenCalled();
  });

  test('persists memory-store backend events once in main process before renderer fanout', async () => {
    const { ws, backendBridge, mainWindow } = setupQueryBridge();

    ws.handlers.message(JSON.stringify({
      type: 'memory-store',
      user_id: 'user-main',
      session_id: 'session-main',
      payload: {
        user_query: 'hi',
        assistant_response: 'hello',
        memory_type: 'episodic',
      },
    }));

    await Promise.resolve();

    expect(backendBridge.storeMemory).toHaveBeenCalledTimes(1);
    expect(backendBridge.storeMemory).toHaveBeenCalledWith({
      user_query: 'hi',
      assistant_response: 'hello',
      memory_type: 'episodic',
      user_id: 'user-main',
      session_id: 'session-main',
    });
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('from-backend', expect.objectContaining({
      type: 'memory-store',
    }));
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

    const queryPromise = sendQuery(handlers, { text: 'mode check', conversation_ref: 'conv-5' });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ws.sent.length).toBe(2);
    const settingsMessage = JSON.parse(ws.sent[1]);
    expect(settingsMessage.type).toBe('update-settings');
    expect(settingsMessage.payload).toEqual(expect.objectContaining({
      interaction_mode: 'agent',
    }));

    emitSettingsUpdatedAck(ws, settingsMessage.id);

    await queryPromise;

    const queryMessage = getLastSentMessage(ws);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>\nmode check\n</user_query>');
  });

  test('waits for pending renderer update-settings ack before sending query', async () => {
    const { handlers, ws } = setupQueryBridge();

    await handlers['to-backend']({ sender: null }, {
      type: 'update-settings',
      payload: { interaction_mode: 'agent' },
    });

    const updateSettingsMessage = JSON.parse(ws.sent[1]);
    expect(updateSettingsMessage.type).toBe('update-settings');

    const queryPromise = sendQuery(handlers, { text: 'after settings update', conversation_ref: 'conv-6' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(ws.sent[ws.sent.length - 1]).type).toBe('update-settings');

    emitSettingsUpdatedAck(ws, updateSettingsMessage.id);

    await queryPromise;

    const queryMessage = getLastSentMessage(ws);
    expect(queryMessage.type).toBe('query');
    expect(queryMessage.payload.content).toContain('<user_query>\nafter settings update\n</user_query>');
  });

  test('sends first query after initial settings sync timeout fallback', async () => {
    jest.useFakeTimers();
    try {
      const { handlers, ws, backendBridge, fs } = initIpc();
      fs.existsSync.mockReturnValue(true);
      fs.promises.readFile.mockResolvedValue(JSON.stringify({
        interaction_mode: 'agent',
        model_mode: 'online',
      }));
      ws.triggerOpen();
      primeQueryContext(backendBridge);

      const queryPromise = sendQuery(handlers, { text: 'timeout fallback query', conversation_ref: 'conv-timeout-1' });
      await Promise.resolve();
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(2500);
      await queryPromise;

      const messageTypes = ws.sent.map((msg) => JSON.parse(msg).type);
      expect(messageTypes).toEqual(['handshake', 'update-settings', 'query']);
      const queryMessage = getLastSentMessage(ws);
      expect(queryMessage.payload.content).toContain('<user_query>\ntimeout fallback query\n</user_query>');
    } finally {
      jest.useRealTimers();
    }
  });

  test('keeps initial query context after transient query send failure', async () => {
    const { handlers, ws, backendBridge } = setupQueryBridge({}, {
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

    await sendQuery(handlers, { text: 'first query', conversation_ref: 'conv-a' });
    await sendQuery(handlers, { text: 'second query', conversation_ref: 'conv-a' });

    expect(backendBridge.getSystemState).toHaveBeenCalledTimes(2);
    expect(backendBridge.getSystemState.mock.calls[0][0]).toEqual([
      'active_window',
      'mouse_position',
      'screen_resolution',
    ]);
    expect(backendBridge.getSystemState.mock.calls[1][0]).toEqual([
      'active_window',
      'mouse_position',
      'screen_resolution',
    ]);
  });

  test('reconnect clears stale conversation ref fallback before next query', async () => {
    jest.useFakeTimers();
    try {
      const { handlers, ws, mainWindow } = setupQueryBridge();

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

      await sendQuery(handlers, { text: 'fresh query after reconnect' });

      const latestLocalUserMessage = getLatestLocalUserMessage(mainWindow);

      expect(latestLocalUserMessage.conversation_ref).toBeNull();
      expect(latestLocalUserMessage.payload.conversation_ref).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
