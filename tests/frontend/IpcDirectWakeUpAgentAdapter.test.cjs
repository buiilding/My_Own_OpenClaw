/** @jest-environment node */

const {
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('../../frontend/src/main/ipc/ipc_desktop_runtime_channels.cjs');
const {
  createDirectWakeUpAgentAdapter,
} = require('../../frontend/src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs');

function createRuntime(overrides = {}) {
  const runtime = {
    eventHandler: null,
    subscribeEvents: jest.fn((handler) => {
      runtime.eventHandler = handler;
      return runtime.detachRuntimeEvents;
    }),
    detachRuntimeEvents: jest.fn(),
    load: jest.fn(async () => ({ displayRows: [], currentTurn: null })),
    send: jest.fn(async () => ({ turnRef: 'turn-sent' })),
    stop: jest.fn(async () => true),
    rehydrateMessages: jest.fn(async () => ({ ok: true })),
    compactHistory: jest.fn(async () => ({ compacted: true })),
    prepareEditAndResend: jest.fn(async () => ({ prepared: 'edit' })),
    prepareRetryTurn: jest.fn(async () => ({ prepared: 'retry' })),
    close: jest.fn(),
    ...overrides,
  };
  return runtime;
}

function createAgent(runtimeFactory = () => createRuntime()) {
  const runtimes = new Map();
  const agent = {
    id: 'agent-1',
    localRuntime: { id: 'local-runtime' },
    conversation: jest.fn(({ conversationRef }) => {
      const runtime = runtimeFactory(conversationRef);
      runtimes.set(conversationRef, runtime);
      return runtime;
    }),
    subscribeRawBackendEvents: jest.fn((handler) => {
      agent.rawBackendHandler = handler;
      return agent.detachRawBackendEvents;
    }),
    detachRawBackendEvents: jest.fn(),
    updateSettings: jest.fn(async () => ({ updated: true })),
    requestModelList: jest.fn(async () => ['model-1']),
    listMemories: jest.fn(async () => []),
    deleteMemory: jest.fn(async () => ({ deleted: true })),
    clearMemories: jest.fn(async () => ({ cleared: true })),
    listConversations: jest.fn(async () => []),
    searchConversations: jest.fn(async () => []),
    deleteConversation: jest.fn(async () => ({ deleted: true })),
    clearConversations: jest.fn(async () => ({ cleared: true })),
    getConversationRevision: jest.fn(async () => ({ revision: true })),
    appendConversationEvent: jest.fn(async () => ({ appended: true })),
    rewriteConversation: jest.fn(async () => ({ rewritten: true })),
    replaceCompactedReplay: jest.fn(async () => ({ replaced: true })),
    wakewordDetected: jest.fn(async () => ({ detected: true })),
    ensureConnected: jest.fn(async () => true),
    isConnected: jest.fn(() => true),
    noteBackendTraffic: jest.fn(),
    syncBackendIdleTimer: jest.fn(),
    status: jest.fn(() => ({ phase: 'ready' })),
    registerMcps: jest.fn(async () => ({ registered: true })),
    sleep: jest.fn(),
    runtimes,
  };
  return agent;
}

function createDeps(overrides = {}) {
  const deps = {
    broadcastToRenderers: jest.fn(),
    resolveRuntimeConversationRef: jest.fn((input = {}) => (
      input?.conversation_ref || input?.conversationRef || input?.payload?.conversation_ref || null
    )),
    setLatestCurrentTurnProjection: jest.fn(),
    getLatestPendingTurn: jest.fn(() => null),
    pendingTurnMatchesCurrentTurn: jest.fn(() => false),
    clearLatestPendingTurn: jest.fn(),
    logLiveSurfaceTrace: jest.fn(),
    summarizeCurrentTurn: jest.fn(currentTurn => ({ turnRef: currentTurn?.turnRef || null })),
    isDebugFlagEnabled: jest.fn(() => false),
    currentTurnTraceLogger: { trace: jest.fn() },
    getSyncSdkLiveTurnSurfaceIntent: jest.fn(() => null),
    log: jest.fn(),
    buildConversationTerminalStatus: jest.fn(() => null),
    resolveWorkspacePathForAgent: jest.fn(() => null),
    handleAgentBackendEvent: jest.fn(),
    refreshMcpServersForConfig: jest.fn(async () => ({ refreshed: true })),
    getMcpClientInfo: jest.fn(() => ({ name: 'Desktop Runtime' })),
    ...overrides,
  };
  return deps;
}

describe('ipc_direct_wake_up_agent_adapter', () => {
  test('creates a default conversation runtime and forwards SDK snapshots to renderer channels', () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const pendingTurn = { conversationRef: 'conv-agent-1', turnRef: 'turn-1' };
    const deps = createDeps({
      getLatestPendingTurn: jest.fn(() => pendingTurn),
      pendingTurnMatchesCurrentTurn: jest.fn(() => true),
      buildConversationTerminalStatus: jest.fn(() => ({ phase: 'complete' })),
      getSyncSdkLiveTurnSurfaceIntent: jest.fn(() => jest.fn()),
      isDebugFlagEnabled: jest.fn(() => true),
    });

    createDirectWakeUpAgentAdapter({
      agent,
      workspacePath: 'C:/repo',
      deps,
    });
    runtime.eventHandler(
      { type: 'memory_store_changed' },
      {
        displayRows: [{ id: 'row-1' }],
        currentTurn: {
          conversationRef: 'conv-agent-1',
          turnRef: 'turn-1',
          phase: 'streaming',
        },
      },
    );

    expect(agent.conversation).toHaveBeenCalledWith({ conversationRef: 'conv-agent-1' });
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.STATUS,
      { phase: 'ready', conversationRef: 'conv-agent-1', workspacePath: 'C:/repo' },
    );
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT,
      { type: 'memory_store_changed' },
    );
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.MEMORY_STORE_CHANGED,
      { type: 'memory_store_changed' },
    );
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.ROWS,
      [{ id: 'row-1' }],
    );
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN,
      expect.objectContaining({ turnRef: 'turn-1' }),
    );
    expect(deps.setLatestCurrentTurnProjection).toHaveBeenCalledWith(expect.objectContaining({
      turnRef: 'turn-1',
    }));
    expect(deps.clearLatestPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-agent-1',
      turnRef: 'turn-1',
      broadcast: true,
    });
    expect(deps.currentTurnTraceLogger.trace).toHaveBeenCalledWith(expect.objectContaining({
      turnRef: 'turn-1',
    }));
  });

  test('rehydrates stored context before sending a query through the conversation runtime', async () => {
    const runtime = createRuntime({
      load: jest.fn(async () => ({
        displayRows: [],
        currentTurn: null,
        rehydrate: {
          messages: [{ role: 'user', content: 'previous' }],
        },
      })),
    });
    const agent = createAgent(() => runtime);
    const deps = createDeps({
      resolveWorkspacePathForAgent: jest.fn(() => 'C:/workspace'),
    });
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      workspacePath: 'C:/fallback',
      deps,
    });

    await expect(adapter.run({
      conversation_ref: 'conv-2',
      text: 'hello',
    })).resolves.toEqual({ turnRef: 'turn-sent' });

    expect(runtime.rehydrateMessages).toHaveBeenCalledWith({
      conversation_ref: 'conv-2',
      messages: [{ role: 'user', content: 'previous' }],
      rehydrate_mode: 'replace',
      workspace_path: 'C:/workspace',
    });
    expect(runtime.send).toHaveBeenCalledWith({
      conversation_ref: 'conv-2',
      text: 'hello',
    });
  });

  test('forwards replay/edit commands through the selected conversation handle and refreshes snapshots', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps: createDeps(),
    });

    await adapter.appendConversationEvent({
      event: { conversation_ref: 'conv-replay', type: 'message' },
    });
    await adapter.prepareRetryTurn({
      conversationRef: 'conv-replay',
      turnRef: 'turn-1',
      revisionId: 'rev-1',
      store: { ignored: true },
    });

    expect(agent.appendConversationEvent).toHaveBeenCalledWith({
      event: { conversation_ref: 'conv-replay', type: 'message' },
    });
    expect(runtime.load).toHaveBeenCalled();
    expect(runtime.prepareRetryTurn).toHaveBeenCalledWith({
      turnRef: 'turn-1',
    });
  });

  test('closes selected and all runtime handles when conversations are deleted or cleared', async () => {
    const runtimes = {
      'conv-agent-1': createRuntime(),
      'conv-delete': createRuntime(),
      'conv-keep': createRuntime(),
    };
    const agent = createAgent(conversationRef => runtimes[conversationRef]);
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps: createDeps(),
    });
    await adapter.loadConversation({ conversationRef: 'conv-delete' });
    await adapter.loadConversation({ conversationRef: 'conv-keep' });

    await adapter.deleteConversation({ conversationRef: 'conv-delete' });
    expect(runtimes['conv-delete'].close).toHaveBeenCalled();
    expect(runtimes['conv-keep'].close).not.toHaveBeenCalled();

    await adapter.clearConversations();
    expect(runtimes['conv-agent-1'].close).toHaveBeenCalled();
    expect(runtimes['conv-keep'].close).toHaveBeenCalled();
  });

  test('forwards raw backend events and detaches subscriptions on close', () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const deps = createDeps();
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      workspacePath: 'C:/repo',
      deps,
    });

    agent.rawBackendHandler({ type: 'backend-event' });
    adapter.close();

    expect(deps.handleAgentBackendEvent).toHaveBeenCalledWith({ type: 'backend-event' });
    expect(agent.detachRawBackendEvents).toHaveBeenCalled();
    expect(runtime.detachRuntimeEvents).toHaveBeenCalled();
    expect(runtime.close).toHaveBeenCalled();
    expect(agent.sleep).toHaveBeenCalled();
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.STATUS,
      { phase: 'closed', conversationRef: 'conv-agent-1', workspacePath: 'C:/repo' },
    );
  });

  test('refreshes MCP servers with local runtime and injected client identity', async () => {
    const agent = createAgent();
    const deps = createDeps();
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps,
    });

    await expect(adapter.refreshMcpServers({ config: { enabled: true } })).resolves.toEqual({
      refreshed: true,
    });
    expect(deps.refreshMcpServersForConfig).toHaveBeenCalledWith({
      config: { enabled: true },
      localRuntime: agent.localRuntime,
      clientInfo: { name: 'Desktop Runtime' },
    });
  });
});
