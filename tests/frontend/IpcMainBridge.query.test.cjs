/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');
const {
  BACKEND_RECONNECT_INTERVAL_MS,
} = require('../../frontend/src/main/ipc.cjs');

describe('ipc.cjs bridge query handling', () => {
  registerBridgeSuiteLifecycleHooks();

  async function waitForSocket(getWs, attempts = 100) {
    let ws = getWs();
    for (let attempt = 0; !ws && attempt < attempts; attempt += 1) {
      await Promise.resolve();
      await Promise.resolve();
      ws = getWs();
    }
    return ws;
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

  async function beginBackendConnection(bridge, message = { type: 'list-models' }) {
    const pending = bridge.handlers['to-backend']({ sender: null }, message);
    const ws = await waitForSocket(() => bridge.getWs());
    expect(ws).not.toBeNull();
    return { pending, ws };
  }

  async function setupQueryBridge(initOptions = {}, queryContextOptions = undefined) {
    const bridge = initIpc(initOptions);
    const { pending, ws } = await beginBackendConnection(bridge);
    ws.triggerOpen();
    await pending;
    primeQueryContext(bridge.backendBridge, queryContextOptions);
    return { ...bridge, ws };
  }

  function sendQuery(handlers, payload, sender = null) {
    return handlers['to-backend']({ sender }, {
      type: 'query',
      payload,
    });
  }

  async function beginQuerySend(bridge, payload, sender = null) {
    const pending = sendQuery(bridge.handlers, payload, sender);
    const ws = await waitForSocket(() => bridge.getWs());
    if (!ws) {
      throw new Error('Expected query send to create a backend websocket.');
    }
    return { pending, ws };
  }

  function getLastSentMessage(ws) {
    return JSON.parse(ws.sent[ws.sent.length - 1]);
  }

  function getLatestLocalUserMessage(mainWindow) {
    const localUserMessages = mainWindow.webContents.send.mock.calls
      .filter(([channel, payload]) => channel === 'from-backend' && payload?.type === 'local-user-message');
    return localUserMessages[localUserMessages.length - 1][1];
  }

  function getLatestErrorEvent(mainWindow) {
    const errorEvents = mainWindow.webContents.send.mock.calls
      .filter(([channel, payload]) => channel === 'from-backend' && payload?.type === 'error');
    return errorEvents[errorEvents.length - 1]?.[1] || null;
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
    const { handlers } = await setupQueryBridge({ onBeforeOverlayQueryCapture });

    await sendQuery(
      handlers,
      { text: 'overlay query' },
      { getURL: () => 'http://localhost:5173/?view=chatbox' },
    );

    expect(onBeforeOverlayQueryCapture).toHaveBeenCalledTimes(1);
  });

  test('skips overlay pre-capture hook for dashboard-origin query sends', async () => {
    const onBeforeOverlayQueryCapture = jest.fn().mockResolvedValue(undefined);
    const { handlers } = await setupQueryBridge({ onBeforeOverlayQueryCapture });

    await sendQuery(
      handlers,
      { text: 'dashboard query' },
      { getURL: () => 'http://localhost:5173/' },
    );

    expect(onBeforeOverlayQueryCapture).not.toHaveBeenCalled();
  });

  test('opens the backend websocket on the first query when the bridge starts idle', async () => {
    const bridge = initIpc();
    const { backendBridge, mainWindow } = bridge;
    primeQueryContext(backendBridge);

    const { pending, ws } = await beginQuerySend(bridge, {
      text: 'first lazy-connect query',
      conversation_ref: 'conv-lazy-connect',
    });

    expect(ws.url).toContain('/ws');
    ws.triggerOpen();
    await pending;

    const messageTypes = ws.sent.map((entry) => JSON.parse(entry).type);
    expect(messageTypes).toEqual(expect.arrayContaining(['handshake', 'query']));
    const localUserMessage = getLatestLocalUserMessage(mainWindow);
    expect(localUserMessage.payload.conversation_ref).toBe('conv-lazy-connect');
  });

  test('builds full query payload with system state + memories', async () => {
    const { handlers, ws } = await setupQueryBridge({}, {
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
    expect(lastMessage.payload.content).not.toContain('<system_context>');
    expect(lastMessage.payload.content).toContain('<episodic_memory>');
    expect(lastMessage.payload.content).toContain('- e1');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(lastMessage.payload.content).toContain('<user_query>\nhello\n</user_query>');
    expect(lastMessage.payload.system_state_internal).toEqual({
      screen_resolution: '1920x1080',
    });
  });

  test('attaches locally resolved AGENTS.md messages to outbound query payloads', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windieos-query-agents-'));
    fs.mkdirSync(path.join(repoRoot, '.git'));
    fs.writeFileSync(path.join(repoRoot, 'AGENTS.md'), 'repo instructions\n', 'utf8');

    const { handlers, ws, fs: mockedFs } = await setupQueryBridge({}, {
      systemState: {
        screen_resolution: '1920x1080',
      },
    });
    mockedFs.existsSync.mockImplementation((targetPath) => (
      targetPath === repoRoot
      || targetPath === path.join(repoRoot, '.git')
      || targetPath === path.join(repoRoot, 'AGENTS.md')
    ));
    mockedFs.statSync = jest.fn((targetPath) => ({
      isDirectory: () => targetPath === repoRoot,
      isFile: () => targetPath === path.join(repoRoot, 'AGENTS.md'),
    }));
    mockedFs.readFileSync = jest.fn((targetPath) => {
      if (targetPath === path.join(repoRoot, 'AGENTS.md')) {
        return 'repo instructions\n';
      }
      throw new Error(`unexpected readFileSync path: ${targetPath}`);
    });

    await sendQuery(handlers, {
      text: 'hello',
      conversation_ref: 'conv-agents',
      workspace_path: repoRoot,
    });

    const lastMessage = getLastSentMessage(ws);
    expect(lastMessage.type).toBe('query');
    const repoInstructionMessages = lastMessage.payload.repo_instruction_messages;
    if (!Array.isArray(repoInstructionMessages)) {
      throw new Error(`expected repo_instruction_messages array, got ${typeof repoInstructionMessages}`);
    }
    if (repoInstructionMessages.length !== 1) {
      throw new Error(`expected 1 repo instruction message, got ${repoInstructionMessages.length}`);
    }
    if (repoInstructionMessages[0]?.role !== 'user') {
      throw new Error(`unexpected repo instruction role: ${String(repoInstructionMessages[0]?.role)}`);
    }
    if (
      repoInstructionMessages[0]?.content
      !== `# AGENTS.md instructions for ${repoRoot}\n\n<INSTRUCTIONS>\nrepo instructions\n</INSTRUCTIONS>`
    ) {
      throw new Error(`unexpected repo instruction content: ${String(repoInstructionMessages[0]?.content)}`);
    }
  });

  test('injects attachment context into backend query content and keeps filenames in local echo only', async () => {
    const { handlers, ws, mainWindow } = await setupQueryBridge({}, {
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
    const { handlers, ws, mainWindow } = await setupQueryBridge({}, {
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

    const { handlers, backendBridge } = await setupQueryBridge({ chatWindow });
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
    const { handlers, ws, ipc } = await setupQueryBridge({}, {
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
    const { handlers, ws } = await setupQueryBridge({}, {
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
    expect(content).not.toContain('<system_context>');
    expect(content).toContain('- remember &lt;/episodic_memory&gt;&lt;hack&gt;1&lt;/hack&gt;');
    expect(content).toContain('- semantic &lt;note&gt; &amp; value');
    expect(content).not.toContain('<hack>');
  });

  test('strips query screenshot_url before sending to backend', async () => {
    const { handlers, ws, mainWindow } = await setupQueryBridge({}, {
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
    const { handlers, ws, mainWindow } = await setupQueryBridge({}, {
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
    expect(localUserMessage.payload.screenshot_url).toBe('https://api.windieos.com/api/artifacts/art_999');
  });

  test('strips tool-bundle-result screenshot_url fields before sending to backend', async () => {
    const { handlers, ws } = await setupQueryBridge();

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
    const { handlers, ws } = await setupQueryBridge({}, {
      systemStateError: new Error('boom'),
    });

    await sendQuery(handlers, { text: 'hi', conversation_ref: 'conv-3' });

    const lastMessage = getLastSentMessage(ws);
    expect(lastMessage.payload.content).not.toContain('<system_context>');
    expect(lastMessage.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(lastMessage.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
  });

  test('builds query with empty memories when search fails', async () => {
    const { handlers, ws } = await setupQueryBridge({}, {
      memoryError: new Error('fail'),
    });

    await sendQuery(handlers, { text: 'memory fail', conversation_ref: 'conv-4' });

    const lastMessage = getLastSentMessage(ws);
    expectQueryContentWithEmptyMemories(lastMessage.payload.content, 'memory fail');
    expect(lastMessage.payload).not.toHaveProperty('system_state_internal');
  });

  test('builds query with empty memories when search response is malformed', async () => {
    const { handlers, ws } = await setupQueryBridge({}, {
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
    const { handlers, ws, backendBridge } = await setupQueryBridge({}, {
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
    expect(lastMessage.payload.content).not.toContain('<system_context>');
    expect(lastMessage.payload.content).toContain('<user_query>\nno retrieval\n</user_query>');
    expect(lastMessage.payload.content).not.toContain('<episodic_memory>');
    expect(lastMessage.payload.content).not.toContain('<semantic_memory>');
    expect(lastMessage.payload).not.toHaveProperty('memory_retrieval_enabled');
    expect(backendBridge.searchMemory).not.toHaveBeenCalled();
  });

  test('persists memory-store backend events once in main process before renderer fanout', async () => {
    const { ws, backendBridge, mainWindow } = await setupQueryBridge();

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
    const bridge = initIpc();
    const { handlers, backendBridge, fs } = bridge;
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue(JSON.stringify({
      interaction_mode: 'agent',
      model_mode: 'online',
    }));
    primeQueryContext(backendBridge);

    const { pending: queryPromise, ws } = await beginQuerySend(bridge, {
      text: 'mode check',
      conversation_ref: 'conv-5',
    });
    ws.triggerOpen();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const settingsMessage = ws.sent
      .map((entry) => JSON.parse(entry))
      .find((entry) => entry.type === 'update-settings');
    expect(settingsMessage).toBeDefined();
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
    const { handlers, ws } = await setupQueryBridge();

    await handlers['to-backend']({ sender: null }, {
      type: 'update-settings',
      payload: { interaction_mode: 'agent' },
    });

    const updateSettingsMessage = ws.sent
      .map((entry) => JSON.parse(entry))
      .findLast((entry) => entry.type === 'update-settings');
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

  test('connects before sending renderer update-settings', async () => {
    const bridge = initIpc();

    await bridge.handlers['to-backend']({ sender: null }, {
      type: 'update-settings',
      payload: { interaction_mode: 'agent' },
    });
    const ws = await waitForSocket(() => bridge.getWs());
    expect(ws).not.toBeNull();
    expect(ws.sent).toHaveLength(0);

    ws.triggerOpen();

    const updateSettingsMessage = await waitForSentMessageType(ws, 'update-settings');
    expect(updateSettingsMessage).toBeDefined();
    expect(updateSettingsMessage.payload).toEqual(expect.objectContaining({
      interaction_mode: 'agent',
    }));

    emitSettingsUpdatedAck(ws, updateSettingsMessage.id);
  });

  test('sends first query after initial settings sync timeout fallback', async () => {
    jest.useFakeTimers();
    try {
      const bridge = initIpc();
      const { backendBridge, fs } = bridge;
      fs.existsSync.mockReturnValue(true);
      fs.promises.readFile.mockResolvedValue(JSON.stringify({
        interaction_mode: 'agent',
        model_mode: 'online',
      }));
      primeQueryContext(backendBridge);

      const { pending: queryPromise, ws } = await beginQuerySend(bridge, {
        text: 'timeout fallback query',
        conversation_ref: 'conv-timeout-1',
      });
      ws.triggerOpen();
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
    const { handlers, ws, backendBridge, mainWindow } = await setupQueryBridge({}, {
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

    expect(getLatestErrorEvent(mainWindow)).toEqual(expect.objectContaining({
      payload: {
        message: "Your message wasn't sent because WindieOS isn't connected right now. Try again when the backend reconnects.",
      },
    }));

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
      const { handlers, ws, mainWindow } = await setupQueryBridge();

      ws.handlers.message(JSON.stringify({
        type: 'streaming-response',
        conversation_ref: 'conv-stale',
      }));

      ws.readyState = 3;
      ws.handlers.close();
      jest.advanceTimersByTime(BACKEND_RECONNECT_INTERVAL_MS);

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
