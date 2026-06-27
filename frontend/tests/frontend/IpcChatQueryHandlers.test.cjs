/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const chatQueryHandlersModule = require('../../src/main/ipc/ipc_chat_query_handlers.cjs');
const {
  createChatQueryHandlerRuntime,
} = chatQueryHandlersModule;

async function waitForMockCall(mockFn) {
  while (mockFn.mock.calls.length === 0) {
    await Promise.resolve();
  }
}

function createRuntimeHarness(overrides = {}) {
  const state = {
    currentConversationRef: null,
    currentSessionId: 'session-1',
    currentServerUserId: 'server-user-1',
    currentUserId: 'user-1',
    isFirstQuery: true,
  };
  const setCurrentConversationRef = jest.fn((conversationRef) => {
    state.currentConversationRef = conversationRef;
  });
  const setActiveQueryContext = jest.fn();
  const setFirstQuery = jest.fn((nextValue) => {
    state.isFirstQuery = nextValue;
  });
  const onBeforeOverlayQueryCapture = jest.fn(async () => {});
  const getWindows = jest.fn(() => ({
    mainWindow: { id: 'main' },
    chatWindow: { id: 'chat' },
  }));
  const deps = {
    BrowserWindow: {},
    screen: {},
    runBeforeOverlayQueryCapture: jest.fn(async ({ onBeforeOverlayQueryCapture: callback }) => {
      await callback();
    }),
    log: jest.fn(),
    prepareRendererQueryPayload: overrides.prepareRendererQueryPayload || jest.fn(() => ({
      payload: {
        text: 'hello',
        conversation_ref: 'conv-1',
      },
      conversationRef: 'conv-1',
      queryMessageId: 'turn-1',
    })),
    resolveConversationRefFromPayload: jest.fn((payload) => payload?.conversation_ref || null),
    uuidGenerator: jest.fn(() => 'turn-generated'),
    logChatPillMainTrace: jest.fn(),
    setResponseOverlayPhase: jest.fn(),
    setActiveDisplayAffinity: jest.fn(),
    resolveActiveSurfaceDisplayAffinity: jest.fn(() => ({ monitor_id: '1' })),
    broadcastToRenderers: jest.fn(),
    ipcEventReplayState: {
      startTurn: jest.fn(),
      clear: jest.fn(),
    },
    buildQueryPayload: overrides.buildQueryPayload || jest.fn(async () => ({
      payload: {
        content: '<user_query>hello</user_query>',
      },
      queryUsedInitialContext: true,
    })),
    broadcastQuerySendFailureRuntime: jest.fn(),
    buildQuerySendFailure: jest.fn(),
    traceRendererQuery: jest.fn(),
  };
  const sendQueryThroughAgentSdkRuntime = jest.fn(async () => 'message-1');
  const attachAgentDefinitionContextToPayload = overrides.attachAgentDefinitionContextToPayload
    || jest.fn((payload) => ({
      ...payload,
      agent_definition: { mode: 'default' },
    }));
  const ensureInitialSettingsSync = overrides.ensureInitialSettingsSync || jest.fn();
  const getPendingSettingsSyncPromise = overrides.getPendingSettingsSyncPromise || jest.fn(() => null);
  const runtime = createChatQueryHandlerRuntime({
    getState: () => ({ ...state }),
    setCurrentConversationRef,
    setActiveQueryContext,
    setFirstQuery,
    attachAgentDefinitionContextToPayload,
    ensureInstallAuthState: jest.fn(),
    isBackendRuntimeConnected: overrides.isBackendRuntimeConnected || jest.fn(() => true),
    ensureBackendConnection: overrides.ensureBackendConnection || jest.fn(),
    ensureInitialSettingsSync,
    getPendingSettingsSyncPromise,
    sendQueryThroughAgentSdkRuntime,
    stopQueryThroughAgentSdkRuntime: jest.fn(async () => true),
    setResponseOverlayPhase: deps.setResponseOverlayPhase,
    resolvePreferredArtifactHttpUrl: jest.fn(() => 'http://127.0.0.1:8000'),
    deps,
  });

  return {
    attachAgentDefinitionContextToPayload,
    deps,
    ensureInitialSettingsSync,
    getPendingSettingsSyncPromise,
    getWindows,
    onBeforeOverlayQueryCapture,
    runtime,
    sendQueryThroughAgentSdkRuntime,
    setActiveQueryContext,
    setCurrentConversationRef,
    setFirstQuery,
  };
}

describe('ipc_chat_query_handlers runtime', () => {
  const retiredHandlersExport = `${['createChatQuery', 'Handlers'].join('')},`;

  test('runtime composes base query dependencies with per-initialize window hooks', async () => {
    const harness = createRuntimeHarness();
    const { handleRendererChatQuery } = harness.runtime.createHandlers({
      getWindows: harness.getWindows,
      onBeforeOverlayQueryCapture: harness.onBeforeOverlayQueryCapture,
    });

    await expect(handleRendererChatQuery({ sender: { id: 'sender' } }, {
      text: 'hello',
      conversation_ref: 'conv-1',
    })).resolves.toEqual({
      ok: true,
      messageId: 'message-1',
      queryMessageId: 'turn-1',
    });

    expect(harness.onBeforeOverlayQueryCapture).toHaveBeenCalledTimes(1);
    expect(harness.getWindows).toHaveBeenCalledTimes(1);
    expect(harness.setCurrentConversationRef).toHaveBeenCalledWith('conv-1');
    expect(harness.setActiveQueryContext).toHaveBeenCalledWith({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      accepted: false,
    });
    expect(harness.setFirstQuery).toHaveBeenCalledWith(false);
    expect(harness.sendQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        text: 'hello',
        content: '<user_query>hello</user_query>',
        agent_definition: { mode: 'default' },
      }),
      messageId: 'turn-1',
    });
    expect(harness.deps.traceRendererQuery).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        agent_definition: { mode: 'default' },
      }),
      rendererPayload: expect.objectContaining({
        text: 'hello',
        conversation_ref: 'conv-1',
      }),
      preparedPayload: expect.objectContaining({
        text: 'hello',
        conversation_ref: 'conv-1',
      }),
      conversationRef: 'conv-1',
      queryMessageId: 'turn-1',
    }));
  });

  test('traces renderer and prepared model checkpoints when SDK payload drops model', async () => {
    const model = { modelProvider: 'anthropic', modelId: 'claude-sonnet-4.5' };
    const harness = createRuntimeHarness({
      prepareRendererQueryPayload: jest.fn(() => ({
        payload: {
          text: 'hello',
          conversation_ref: 'conv-1',
          model,
        },
        conversationRef: 'conv-1',
        queryMessageId: 'turn-1',
      })),
      buildQueryPayload: jest.fn(async () => ({
        payload: {
          content: '<user_query>hello</user_query>',
        },
        queryUsedInitialContext: true,
      })),
      attachAgentDefinitionContextToPayload: jest.fn((payload) => {
        const nextPayload = { ...payload };
        delete nextPayload.model;
        return {
          ...nextPayload,
          agent_definition: { mode: 'default' },
        };
      }),
    });
    const { handleRendererChatQuery } = harness.runtime.createHandlers({
      getWindows: harness.getWindows,
      onBeforeOverlayQueryCapture: harness.onBeforeOverlayQueryCapture,
    });

    await handleRendererChatQuery({ sender: { id: 'sender' } }, {
      text: 'hello',
      conversation_ref: 'conv-1',
      model,
    });

    expect(harness.deps.traceRendererQuery).toHaveBeenCalledWith(expect.objectContaining({
      rendererPayload: expect.objectContaining({ model }),
      preparedPayload: expect.objectContaining({ model }),
      payload: expect.not.objectContaining({ model }),
      conversationRef: 'conv-1',
      queryMessageId: 'turn-1',
    }));
  });

  test('waits for initial settings sync before attaching agent definition context', async () => {
    const order = [];
    let resolvePendingSettingsSync;
    const pendingSettingsSync = new Promise((resolve) => {
      resolvePendingSettingsSync = resolve;
    });
    const harness = createRuntimeHarness({
      ensureInitialSettingsSync: jest.fn(async () => {
        order.push('settings-sync');
      }),
      getPendingSettingsSyncPromise: jest.fn(() => {
        order.push('pending-settings-sync');
        return pendingSettingsSync;
      }),
      attachAgentDefinitionContextToPayload: jest.fn((payload) => {
        order.push('attach-agent-definition');
        return {
          ...payload,
          agent_definition: { mode: 'hydrated-settings' },
        };
      }),
    });
    const { handleRendererChatQuery } = harness.runtime.createHandlers({
      getWindows: harness.getWindows,
      onBeforeOverlayQueryCapture: harness.onBeforeOverlayQueryCapture,
    });

    const resultPromise = handleRendererChatQuery({ sender: { id: 'sender' } }, {
      text: 'hello',
      conversation_ref: 'conv-1',
    });
    await waitForMockCall(harness.getPendingSettingsSyncPromise);

    expect(harness.attachAgentDefinitionContextToPayload).not.toHaveBeenCalled();

    resolvePendingSettingsSync();

    await expect(resultPromise).resolves.toMatchObject({ ok: true });
    expect(order).toEqual([
      'settings-sync',
      'pending-settings-sync',
      'attach-agent-definition',
    ]);
    expect(harness.sendQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        agent_definition: { mode: 'hydrated-settings' },
      }),
      messageId: 'turn-1',
    });
  });

  test('ipc.cjs composes chat query handlers through the runtime wrapper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_chat_query_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createChatQueryHandlerRuntime({');
    expect(mainSource).not.toContain('chatQueryHandlerRuntime.createHandlers({');
    expect(initializationSource).toContain('chatQueryHandlerRuntime.createHandlers({');
    expect(mainSource).not.toContain('createChatQueryHandlers({');
    expect(helperSource).toContain('function createChatQueryHandlerRuntime');
    expect(helperSource).toContain('return createChatQueryHandlers({');
    expect(helperSource).toContain('createRendererQuerySendRuntime({ deps })');
    expect(chatQueryHandlersModule.createChatQueryHandlers).toBeUndefined();
    expect(helperSource).not.toContain(retiredHandlersExport);
  });
});
