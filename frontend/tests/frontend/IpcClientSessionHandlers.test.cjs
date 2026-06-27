/**
 * Covers client session snapshot and transcript sync IPC handlers.
 */

const fs = require('fs/promises');
const path = require('path');

const clientSessionHandlersModule = require('../../src/main/ipc/ipc_client_session_handlers.cjs');
const {
  createClientSessionHandlersRuntime,
} = clientSessionHandlersModule;

function createHarness(overrides = {}) {
  const handlers = {};
  const listeners = {};
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
    on: jest.fn((channel, listener) => {
      listeners[channel] = listener;
    }),
  };
  const state = {
    currentUserId: 'user-1',
    currentConversationRef: 'conv-1',
    currentServerUserId: 'server-user-1',
    currentSessionId: 'session-1',
    isConnected: true,
    globalAgentStopShortcutStatus: { enabled: true },
    ...(overrides.state || {}),
  };
  const endpoints = {
    runtimeWsUrl: 'wss://runtime.example/ws',
    runtimeHttpUrl: 'https://runtime.example',
    ...(overrides.endpoints || {}),
  };
  const broadcastToRenderers = jest.fn();
  const setTranscriptSessionState = jest.fn((nextState) => {
    state.currentConversationRef = nextState.currentConversationRef;
    state.currentUserId = nextState.currentUserId;
  });

  const runtime = createClientSessionHandlersRuntime({
    getClientSessionState: () => ({ ...state }),
    getRuntimeEndpointSnapshot: () => ({ ...endpoints }),
    setTranscriptSessionState,
    broadcastToRenderers,
    ...overrides.runtime,
  });
  runtime.register({ ipcMain });

  return {
    broadcastToRenderers,
    endpoints,
    handlers,
    ipcMain,
    listeners,
    setTranscriptSessionState,
    state,
  };
}

describe('client session IPC handlers', () => {
  test('builds the renderer-facing client session snapshot through the registered handler', async () => {
    const { handlers } = createHarness();

    await expect(handlers['get-client-user-id']()).resolves.toEqual({
      userId: 'user-1',
      conversationRef: 'conv-1',
      serverUserId: 'server-user-1',
      sessionId: 'session-1',
      isConnected: true,
      runtimeWsUrl: 'wss://runtime.example/ws',
      runtimeHttpUrl: 'https://runtime.example',
      globalAgentStopShortcutStatus: { enabled: true },
    });
  });

  test('registers client snapshot and transcript sync handlers', () => {
    const { handlers, listeners } = createHarness();

    expect(typeof handlers['get-client-user-id']).toBe('function');
    expect(typeof listeners['transcript-session-sync']).toBe('function');
  });

  test('returns current session state plus runtime endpoints', async () => {
    const { handlers } = createHarness();

    await expect(handlers['get-client-user-id']()).resolves.toEqual({
      userId: 'user-1',
      conversationRef: 'conv-1',
      serverUserId: 'server-user-1',
      sessionId: 'session-1',
      isConnected: true,
      runtimeWsUrl: 'wss://runtime.example/ws',
      runtimeHttpUrl: 'https://runtime.example',
      globalAgentStopShortcutStatus: { enabled: true },
    });
  });

  test('updates main session state after transcript sync and rebroadcasts', () => {
    const {
      broadcastToRenderers,
      listeners,
      setTranscriptSessionState,
      state,
    } = createHarness();
    const sender = { id: 12 };

    listeners['transcript-session-sync']({ sender }, {
      conversationRef: 'conv-2',
      userId: 'user-2',
    });

    expect(setTranscriptSessionState).toHaveBeenCalledWith({
      currentConversationRef: 'conv-2',
      currentUserId: 'user-2',
    });
    expect(state.currentConversationRef).toBe('conv-2');
    expect(state.currentUserId).toBe('user-2');
    expect(broadcastToRenderers).toHaveBeenCalledWith('transcript-session-sync', {
      conversationRef: 'conv-2',
      userId: 'user-2',
    }, sender);
  });

  test('ignores non-actionable transcript sync payloads', () => {
    const { broadcastToRenderers, listeners, setTranscriptSessionState } = createHarness();

    listeners['transcript-session-sync']({ sender: null }, {
      ignored: 'value',
    });

    expect(setTranscriptSessionState).not.toHaveBeenCalled();
    expect(broadcastToRenderers).not.toHaveBeenCalled();
  });

  test('runtime registers session handlers with injected state dependencies', async () => {
    const handlers = {};
    const listeners = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
      on: jest.fn((channel, listener) => {
        listeners[channel] = listener;
      }),
    };
    const setTranscriptSessionState = jest.fn();
    const broadcastToRenderers = jest.fn();
    const runtime = createClientSessionHandlersRuntime({
      getClientSessionState: () => ({
        currentUserId: 'runtime-user',
        currentConversationRef: 'runtime-conv',
        currentServerUserId: 'runtime-server-user',
        currentSessionId: 'runtime-session',
        isConnected: true,
      }),
      getRuntimeEndpointSnapshot: () => ({
        runtimeWsUrl: 'wss://runtime.example/ws',
        runtimeHttpUrl: 'https://runtime.example',
      }),
      setTranscriptSessionState,
      broadcastToRenderers,
    });

    runtime.register({ ipcMain });

    await expect(handlers['get-client-user-id']()).resolves.toEqual({
      userId: 'runtime-user',
      conversationRef: 'runtime-conv',
      serverUserId: 'runtime-server-user',
      sessionId: 'runtime-session',
      isConnected: true,
      runtimeWsUrl: 'wss://runtime.example/ws',
      runtimeHttpUrl: 'https://runtime.example',
      globalAgentStopShortcutStatus: null,
    });

    listeners['transcript-session-sync']({ sender: 'renderer-1' }, {
      conversationRef: 'runtime-conv-2',
      userId: 'runtime-user-2',
    });

    expect(setTranscriptSessionState).toHaveBeenCalledWith({
      currentConversationRef: 'runtime-conv-2',
      currentUserId: 'runtime-user-2',
    });
    expect(broadcastToRenderers).toHaveBeenCalledWith('transcript-session-sync', {
      conversationRef: 'runtime-conv-2',
      userId: 'runtime-user-2',
    }, 'renderer-1');
  });

  test('ipc.cjs delegates client session channel bodies to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_client_session_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createClientSessionHandlersRuntime({');
    expect(mainSource).not.toContain('clientSessionHandlersRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('clientSessionHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerClientSessionHandlers({');
    expect(mainSource).not.toContain("ipcMain.handle('get-client-user-id'");
    expect(mainSource).not.toContain("ipcMain.on('transcript-session-sync'");
    expect(helperSource).toContain('function createClientSessionHandlersRuntime');
    expect(helperSource).toContain('return registerClientSessionHandlers({');
    expect(clientSessionHandlersModule.registerClientSessionHandlers).toBeUndefined();
    expect(clientSessionHandlersModule.buildClientSessionSnapshot).toBeUndefined();
    expect(helperSource).toContain("ipcMain.handle('get-client-user-id'");
    expect(helperSource).toContain("ipcMain.on('transcript-session-sync'");
  });
});
