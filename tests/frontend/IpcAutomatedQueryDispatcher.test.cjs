/**
 * Covers ipc automated query dispatcher. behavior in the frontend test suite.
 */

const {
  createAutomatedQueryDispatcher,
} = require('../../frontend/src/main/ipc/ipc_automated_query_dispatcher.cjs');

function createHarness(overrides = {}) {
  let currentConversationRef = null;
  let isFirstQuery = true;
  const deps = {
    prepareAutomatedQueryPayload: jest.fn((options) => ({
      text: String(options.text || '').trim(),
      conversationRef: options.conversationRef || null,
      attachmentContext: options.attachmentContext || null,
      attachmentFilenames: options.attachmentFilenames || [],
      memoryRetrievalEnabled: options.memoryRetrievalEnabled !== false,
    })),
    ensureBackendConnection: jest.fn(async () => undefined),
    ensureInitialSettingsSync: jest.fn(async () => undefined),
    getPendingSettingsSyncPromise: jest.fn(() => null),
    buildQueryPayload: jest.fn(async ({ basePayload, conversationRef, currentUserId, isFirstQuery: firstQuery }) => ({
      payload: {
        ...basePayload,
        output: `built:${basePayload.text}`,
        current_user_id: currentUserId,
        first_query: firstQuery,
      },
      queryUsedInitialContext: firstQuery,
      userId: currentUserId,
      conversationRef,
    })),
    buildQueryPayloadContext: jest.fn(),
    attachAgentDefinitionContext: jest.fn((payload) => ({
      ...payload,
      agent_definition: { mode: 'test' },
    })),
    sendQueryThroughAgentSdkRuntime: jest.fn(async () => 'sdk-message-1'),
    getState: jest.fn(() => ({
      currentUserId: 'user-1',
      isFirstQuery,
    })),
    setCurrentConversationRef: jest.fn((conversationRef) => {
      currentConversationRef = conversationRef;
    }),
    setFirstQuery: jest.fn((nextValue) => {
      isFirstQuery = nextValue;
    }),
    uuidGenerator: jest.fn()
      .mockReturnValueOnce('generated-conv')
      .mockReturnValueOnce('query-message-1'),
    log: jest.fn(),
    ...overrides,
  };
  const dispatcher = createAutomatedQueryDispatcher(deps);

  return {
    deps,
    dispatcher,
    getState: () => ({
      currentConversationRef,
      isFirstQuery,
    }),
  };
}

describe('ipc_automated_query_dispatcher', () => {
  test('rejects missing query text before connecting', async () => {
    const { deps, dispatcher } = createHarness({
      prepareAutomatedQueryPayload: jest.fn(() => null),
    });

    await expect(dispatcher.sendAutomatedQuery({})).resolves.toEqual({
      ok: false,
      error: 'Missing query text',
    });
    expect(deps.ensureBackendConnection).not.toHaveBeenCalled();
  });

  test('returns backend connection errors without dispatching', async () => {
    const { deps, dispatcher } = createHarness({
      ensureBackendConnection: jest.fn(async () => {
        throw new Error('closed');
      }),
    });

    await expect(dispatcher.sendAutomatedQuery({ text: 'run this' })).resolves.toEqual({
      ok: false,
      error: 'closed',
    });
    expect(deps.sendQueryThroughAgentSdkRuntime).not.toHaveBeenCalled();
  });

  test('builds and dispatches automated queries through the SDK runtime', async () => {
    const pendingSettings = Promise.resolve();
    const {
      deps,
      dispatcher,
      getState,
    } = createHarness({
      getPendingSettingsSyncPromise: jest.fn(() => pendingSettings),
    });

    const result = await dispatcher.sendAutomatedQuery({
      text: 'inspect app',
      attachmentFilenames: ['screenshot.png'],
    });

    expect(deps.ensureBackendConnection).toHaveBeenCalledWith('automated-query');
    expect(deps.ensureInitialSettingsSync).toHaveBeenCalledTimes(1);
    expect(deps.buildQueryPayload).toHaveBeenCalledWith(expect.objectContaining({
      basePayload: {
        text: 'inspect app',
        conversation_ref: 'vm-run-generated-conv',
        memory_retrieval_enabled: true,
        attachment_filenames: ['screenshot.png'],
      },
      conversationRef: 'vm-run-generated-conv',
      currentUserId: 'user-1',
      isFirstQuery: true,
    }));
    expect(deps.sendQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      messageId: 'query-message-1',
      payload: {
        text: 'inspect app',
        conversation_ref: 'vm-run-generated-conv',
        output: 'built:inspect app',
        current_user_id: 'user-1',
        first_query: true,
        memory_retrieval_enabled: true,
        attachment_filenames: ['screenshot.png'],
        agent_definition: { mode: 'test' },
      },
    });
    expect(result).toEqual({
      ok: true,
      messageId: 'sdk-message-1',
      queryMessageId: 'query-message-1',
      conversationRef: 'vm-run-generated-conv',
      userId: 'user-1',
    });
    expect(getState()).toEqual({
      currentConversationRef: 'vm-run-generated-conv',
      isFirstQuery: false,
    });
  });

  test('keeps first-query state when built query did not use initial context', async () => {
    const { deps, dispatcher } = createHarness({
      buildQueryPayload: jest.fn(async () => ({
        payload: {},
        queryUsedInitialContext: false,
        userId: 'user-1',
      })),
    });

    await dispatcher.sendAutomatedQuery({
      text: 'continue',
      conversationRef: 'conv-existing',
    });

    expect(deps.setCurrentConversationRef).toHaveBeenCalledWith('conv-existing');
    expect(deps.setFirstQuery).not.toHaveBeenCalled();
  });
});
