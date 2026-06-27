/** @jest-environment node */

const fs = require('fs');
const path = require('path');

const {
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('../../src/main/ipc/ipc_desktop_runtime_channels.cjs');
const {
  createDirectWakeUpAgentAdapter,
} = require('../../src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs');
const {
  normalizeRuntimeSendInput,
} = require('../../src/main/ipc/ipc_runtime_send_input.cjs');
const directWakeUpAgentAdapterModule = require('../../src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs');

function createRuntime(overrides = {}) {
  const runtime = {
    eventHandler: null,
    subscribeEvents: jest.fn((handler) => {
      runtime.eventHandler = handler;
      return runtime.detachRuntimeEvents;
    }),
    detachRuntimeEvents: jest.fn(),
    load: jest.fn(async () => ({
      displayRows: [],
      currentTurn: null,
      view: {
        conversationRef: 'conv-replay',
        revisionId: 'rev-loaded',
        displayRows: [],
      },
    })),
    rehydrate: jest.fn(async () => ({
      displayRows: [],
      currentTurn: null,
      rehydrate: { messages: [] },
    })),
    send: jest.fn(async () => ({ turnRef: 'turn-sent' })),
    stop: jest.fn(async () => true),
    rehydrateMessages: jest.fn(async () => ({ ok: true })),
    compactHistory: jest.fn(async () => ({ compacted: true })),
    loadDisplayTimeline: jest.fn(async () => ({ rows: [] })),
    replaceRows: jest.fn(async input => ({ ...input, revisionId: 'rev-child' })),
    editAndResend: jest.fn(async input => ({
      turnRef: input.turnRef,
      queryMessageId: 'msg-edit',
    })),
    retryTurn: jest.fn(async input => ({
      turnRef: input.turnRef,
      queryMessageId: 'msg-retry',
    })),
    checkoutRevision: jest.fn(async input => ({
      displayTimeline: {
        conversationRef: 'conv-replay',
        revisionId: input.revisionId,
        rows: [],
      },
      modelHistoryCheckpoint: null,
      view: {
        conversationRef: 'conv-replay',
        revisionId: input.revisionId,
        displayRows: [],
      },
    })),
    fork: jest.fn(async input => ({
      conversationRef: input.newConversationRef,
      revisionId: 'rev-forked',
      sourceConversationRef: 'conv-replay',
      sourceRevisionId: input.sourceRevisionId,
      cutAfterRowId: input.cutAfterRowId,
      displayRowCount: 2,
      modelHistoryRowCount: 2,
    })),
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
      agent.sdkBackendEventHandler = handler;
      return agent.detachBackendEventSubscription;
    }),
    detachBackendEventSubscription: jest.fn(),
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
    setLatestSdkLiveTurn: jest.fn(),
    setLatestConversationView: jest.fn(),
    getLatestPendingTurn: jest.fn(() => null),
    pendingTurnMatchesCurrentTurn: jest.fn(() => false),
    clearLatestPendingTurn: jest.fn(),
    logLiveSurfaceTrace: jest.fn(),
    summarizeCurrentTurn: jest.fn(currentTurn => ({ turnRef: currentTurn?.turnRef || null })),
    isDebugFlagEnabled: jest.fn(() => false),
    currentTurnTraceLogger: { trace: jest.fn() },
    traceRuntimeSend: jest.fn(),
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
  test('main process does not rebuild edit resend supersession from renderer state', () => {
    const mainIpcRoot = path.resolve(__dirname, '../../src/main/ipc');
    const directAdapterSource = fs.readFileSync(
      path.join(mainIpcRoot, 'ipc_direct_wake_up_agent_adapter.cjs'),
      'utf8',
    );
    const liveTurnStateSource = fs.readFileSync(
      path.join(mainIpcRoot, 'ipc_live_turn_state.cjs'),
      'utf8',
    );
    const pendingTurnSource = fs.readFileSync(
      path.join(mainIpcRoot, 'ipc_pending_turn_handlers.cjs'),
      'utf8',
    );

    expect(`${directAdapterSource}\n${liveTurnStateSource}\n${pendingTurnSource}`)
      .not.toContain('supersededTurnRef');
    expect(liveTurnStateSource).not.toContain('supersededTurnRefs');
    expect(liveTurnStateSource).not.toContain('isSupersededTurnRef');
  });

  test('creates a default conversation runtime and forwards SDK snapshots to renderer channels', () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const pendingTurn = { conversationRef: 'conv-agent-1', turnRef: 'turn-1' };
    const syncSdkLiveTurnSurfaceIntent = jest.fn();
    const deps = createDeps({
      getLatestPendingTurn: jest.fn(() => pendingTurn),
      pendingTurnMatchesCurrentTurn: jest.fn(() => true),
      buildConversationTerminalStatus: jest.fn(() => ({ phase: 'complete' })),
      getSyncSdkLiveTurnSurfaceIntent: jest.fn(() => syncSdkLiveTurnSurfaceIntent),
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
        view: {
          conversationRef: 'conv-agent-1',
          displayRows: [{ id: 'row-view' }],
          liveTurn: {
            turnRef: 'turn-1',
            phase: 'streaming',
            entries: [],
            isBusy: true,
          },
          surfaces: {
            responseOverlay: {
              mode: 'response',
              visible: true,
              guardRef: 'turn-1',
              ownerConversationRef: 'conv-agent-1',
              turnRef: 'turn-1',
            },
          },
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
      {
        conversationRef: 'conv-agent-1',
        rows: [{ id: 'row-view' }],
      },
    );
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN,
      expect.objectContaining({
        conversationRef: 'conv-agent-1',
        currentTurn: expect.objectContaining({ turnRef: 'turn-1' }),
        view: expect.objectContaining({
          conversationRef: 'conv-agent-1',
        }),
      }),
    );
    expect(syncSdkLiveTurnSurfaceIntent).toHaveBeenCalledWith(expect.objectContaining({
      currentTurn: expect.objectContaining({ turnRef: 'turn-1' }),
      view: expect.objectContaining({ conversationRef: 'conv-agent-1' }),
    }));
    expect(deps.setLatestSdkLiveTurn).toHaveBeenCalledWith(expect.objectContaining({
      turnRef: 'turn-1',
    }));
    expect(deps.setLatestConversationView).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-agent-1',
    }));
    expect(deps.clearLatestPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-agent-1',
      turnRef: 'turn-1',
      broadcast: false,
    });
    expect(deps.currentTurnTraceLogger.trace).toHaveBeenCalledWith(expect.objectContaining({
      turnRef: 'turn-1',
    }));
  });

  test('clears main pending cache without broadcasting renderer pending-clear before current-turn handoff', () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const pendingTurn = { conversationRef: 'conv-agent-1', turnRef: 'turn-1' };
    const deps = createDeps({
      getLatestPendingTurn: jest.fn(() => pendingTurn),
      pendingTurnMatchesCurrentTurn: jest.fn(() => true),
    });

    createDirectWakeUpAgentAdapter({
      agent,
      workspacePath: 'C:/repo',
      deps,
    });
    runtime.eventHandler(
      { type: 'turn_started' },
      {
        displayRows: [],
        currentTurn: {
          conversationRef: 'conv-agent-1',
          turnRef: 'turn-1',
          phase: 'awaiting',
        },
      },
    );

    expect(deps.clearLatestPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-agent-1',
      turnRef: 'turn-1',
      broadcast: false,
    });
    expect(deps.broadcastToRenderers).not.toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN,
      expect.objectContaining({ type: 'clear' }),
    );
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN,
      expect.objectContaining({
        currentTurn: expect.objectContaining({ turnRef: 'turn-1', phase: 'awaiting' }),
      }),
    );
  });

  test('rehydrates stored context through the SDK runtime before sending a query', async () => {
    const runtime = createRuntime({
      rehydrate: jest.fn(async () => ({
        displayRows: [],
        currentTurn: null,
        rehydrate: {
          messages: [
            {
              role: 'user',
              content: 'previous',
              image_refs: ['display-only-artifact'],
              source_display_row_ids: ['display-user'],
            },
          ],
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

    expect(runtime.rehydrate).toHaveBeenCalledWith({
      workspace_path: 'C:/workspace',
    });
    expect(runtime.rehydrateMessages).not.toHaveBeenCalled();
    expect(runtime.send).toHaveBeenCalledWith({
      text: 'hello',
      turnRef: undefined,
      payload: {
        conversation_ref: 'conv-2',
      },
      resources: undefined,
      metadata: undefined,
      model: undefined,
    });
  });

  test('maps AgentQueryInput fields into the conversation runtime send payload', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const deps = createDeps();
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps,
    });
    const agentDefinition = {
      system_prompt: { mode: 'replace', content: 'Use saved config.' },
      tools: {
        mode: 'explicit',
        disabled_tools: ['mouse_control'],
        client_manifest: { version: 1, tools: [] },
      },
    };
    const resources = [{ type: 'file', id: 'file-1' }];
    const metadata = { source: 'renderer' };
    const model = { modelProvider: 'scripted', modelId: 'scripted-runtime' };

    await adapter.run({
      text: 'hello',
      conversationRef: 'conv-agent-input',
      turnRef: 'turn-1',
      backendPayload: {
        text: 'hello',
        conversation_ref: 'conv-agent-input',
      },
      agentDefinition,
      content: '<user_query>hello</user_query>',
      screenshotRef: 'art-1',
      screenshotRefs: ['art-1'],
      attachmentContext: 'attachment summary',
      attachmentFilenames: ['notes.txt'],
      systemStateInternal: { platform: 'darwin' },
      workspacePath: '/repo',
      resources,
      metadata,
    }, { model });

    expect(runtime.send).toHaveBeenCalledWith({
      text: 'hello',
      turnRef: 'turn-1',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-agent-input',
        agent_definition: agentDefinition,
        content: '<user_query>hello</user_query>',
        screenshot_ref: 'art-1',
        screenshot_refs: ['art-1'],
        attachment_context: 'attachment summary',
        attachment_filenames: ['notes.txt'],
        system_state_internal: { platform: 'darwin' },
        workspace_path: '/repo',
      },
      resources,
      metadata,
      model,
    });
    expect(deps.traceRuntimeSend).toHaveBeenCalledWith({
      text: 'hello',
      turnRef: 'turn-1',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-agent-input',
        agent_definition: agentDefinition,
        content: '<user_query>hello</user_query>',
        screenshot_ref: 'art-1',
        screenshot_refs: ['art-1'],
        attachment_context: 'attachment summary',
        attachment_filenames: ['notes.txt'],
        system_state_internal: { platform: 'darwin' },
        workspace_path: '/repo',
      },
      resources,
      metadata,
      model,
      conversationRef: 'conv-agent-input',
    });
  });

  test('maps SDK stop options into the conversation runtime stop turn', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const deps = createDeps();
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps,
    });

    await expect(adapter.stop({
      conversationRef: 'conv-agent-stop',
      turnRef: 'turn-agent-stop',
    })).resolves.toBe(true);

    expect(runtime.stop).toHaveBeenCalledWith('turn-agent-stop');
  });

  test('rejects removed snake_case stop options in direct wake-up adapter', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const deps = createDeps();
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps,
    });

    await expect(adapter.stop({
      conversation_ref: 'conv-agent-stop',
      turn_ref: 'turn-agent-stop',
    })).rejects.toThrow(
      'Agent SDK conversation commands require conversationRef; conversation_ref is not supported.',
    );
    expect(runtime.stop).not.toHaveBeenCalled();
  });

  test('normalizes query agent definition into payload.agent_definition with backend payload fallback', () => {
    const backendPayloadAgentDefinition = {
      tools: {
        mode: 'explicit',
        disabled_tools: ['browser'],
        client_manifest: { version: 1, tools: [] },
      },
    };
    const explicitAgentDefinition = {
      tools: {
        mode: 'explicit',
        disabled_tools: ['mouse_control'],
        client_manifest: { version: 1, tools: [] },
      },
    };

    expect(normalizeRuntimeSendInput({
      text: 'hello',
      backendPayload: {
        conversation_ref: 'conv-fallback',
        agent_definition: backendPayloadAgentDefinition,
      },
    })).toMatchObject({
      text: 'hello',
      payload: {
        conversation_ref: 'conv-fallback',
        agent_definition: backendPayloadAgentDefinition,
      },
    });
    expect(normalizeRuntimeSendInput({
      text: 'hello',
      backendPayload: {
        conversation_ref: 'conv-explicit',
        agent_definition: backendPayloadAgentDefinition,
      },
      agentDefinition: explicitAgentDefinition,
    })).toMatchObject({
      text: 'hello',
      payload: {
        conversation_ref: 'conv-explicit',
        agent_definition: explicitAgentDefinition,
      },
    });
  });

  test('forwards display replacement commands through the selected conversation handle and refreshes snapshots', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps: createDeps(),
    });

    await adapter.appendConversationEvent({
      event: { conversationRef: 'conv-replay', type: 'message' },
    });
    await adapter.replaceRows({
      conversationRef: 'conv-replay',
      baseRevisionId: 'rev-base',
      reason: 'retry',
      rows: [],
      revisionId: 'rev-1',
      store: { ignored: true },
    });

    expect(agent.appendConversationEvent).toHaveBeenCalledWith({
      event: { conversationRef: 'conv-replay', type: 'message' },
    });
    expect(runtime.load).toHaveBeenCalled();
    expect(runtime.replaceRows).toHaveBeenCalledWith({
      baseRevisionId: 'rev-base',
      reason: 'retry',
      rows: [],
    });
  });

  test('forwards SDK replay edit and retry commands through the selected conversation handle', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps: createDeps(),
    });

    await expect(adapter.editAndResend({
      conversationRef: 'conv-replay',
      messageId: 'row-user',
      text: 'edited text',
      turnRef: 'turn-edit',
      payload: { screenshot_refs: ['artifact-one'] },
      revisionId: 'rev-1',
      store: { ignored: true },
    })).resolves.toEqual({
      turnRef: 'turn-edit',
      queryMessageId: 'msg-edit',
    });

    await expect(adapter.retryTurn({
      conversationRef: 'conv-replay',
      messageId: 'row-assistant',
      turnRef: 'turn-retry',
      payload: { screenshot_ref: 'artifact-one' },
      revisionId: 'rev-1',
      store: { ignored: true },
    })).resolves.toEqual({
      turnRef: 'turn-retry',
      queryMessageId: 'msg-retry',
    });

    expect(runtime.editAndResend).toHaveBeenCalledWith({
      messageId: 'row-user',
      text: 'edited text',
      turnRef: 'turn-edit',
      payload: { screenshot_refs: ['artifact-one'] },
    });
    expect(runtime.retryTurn).toHaveBeenCalledWith({
      messageId: 'row-assistant',
      turnRef: 'turn-retry',
      payload: { screenshot_ref: 'artifact-one' },
    });
    expect(runtime.load).toHaveBeenCalledTimes(2);
  });

  test('forwards revision checkout and fork commands through the selected conversation handle', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps: createDeps(),
    });

    await expect(adapter.checkoutRevision({
      conversationRef: 'conv-replay',
      revisionId: 'rev-child',
    })).resolves.toEqual(expect.objectContaining({
      displayTimeline: {
        conversationRef: 'conv-replay',
        revisionId: 'rev-child',
        rows: [],
      },
      modelHistoryCheckpoint: null,
      view: expect.objectContaining({
        revisionId: 'rev-child',
      }),
    }));

    await expect(adapter.forkConversation({
      conversationRef: 'conv-replay',
      sourceRevisionId: 'rev-child',
      cutAfterRowId: 'row-assistant',
      newConversationRef: 'conv-forked',
      revisionId: 'ignored-active-revision',
      store: { ignored: true },
    })).resolves.toEqual(expect.objectContaining({
      conversationRef: 'conv-forked',
      revisionId: 'rev-forked',
      view: expect.objectContaining({
        revisionId: 'rev-loaded',
      }),
    }));

    expect(runtime.checkoutRevision).toHaveBeenCalledWith({
      revisionId: 'rev-child',
    });
    expect(runtime.fork).toHaveBeenCalledWith({
      sourceRevisionId: 'rev-child',
      cutAfterRowId: 'row-assistant',
      newConversationRef: 'conv-forked',
    });
    expect(runtime.load).toHaveBeenCalledTimes(3);
  });

  test('SDK library conversation methods reject removed snake_case conversation aliases', async () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      deps: createDeps(),
    });

    await adapter.loadConversation(' conv-sdk ');

    expect(agent.conversation).toHaveBeenCalledWith({ conversationRef: 'conv-sdk' });
    expect(directWakeUpAgentAdapterModule.resolveSdkCommandConversationRef).toBeUndefined();

    await expect(adapter.deleteConversation({ conversation_ref: 'conv-legacy' }))
      .rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
    await expect(adapter.loadConversation({ conversation_ref: 'conv-legacy' }))
      .rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
    await expect(adapter.appendConversationEvent({
      event: { conversation_ref: 'conv-legacy', type: 'message' },
    })).rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
    await expect(adapter.replaceRows({ conversation_ref: 'conv-legacy' }))
      .rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
    await expect(adapter.editAndResend({ conversation_ref: 'conv-legacy' }))
      .rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
    await expect(adapter.retryTurn({ conversation_ref: 'conv-legacy' }))
      .rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
    await expect(adapter.checkoutRevision({ conversation_ref: 'conv-legacy' }))
      .rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
    await expect(adapter.forkConversation({ conversation_ref: 'conv-legacy' }))
      .rejects.toThrow('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');

    expect(agent.deleteConversation).not.toHaveBeenCalled();
    expect(agent.appendConversationEvent).not.toHaveBeenCalled();
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

  test('forwards SDK backend events and detaches subscriptions on close', () => {
    const runtime = createRuntime();
    const agent = createAgent(() => runtime);
    const deps = createDeps();
    const adapter = createDirectWakeUpAgentAdapter({
      agent,
      workspacePath: 'C:/repo',
      deps,
    });

    agent.sdkBackendEventHandler({ type: 'backend-event' });
    adapter.close();

    expect(deps.handleAgentBackendEvent).toHaveBeenCalledWith({ type: 'backend-event' });
    expect(agent.detachBackendEventSubscription).toHaveBeenCalled();
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
