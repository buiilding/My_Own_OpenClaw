/**
 * Covers ipc automated query runtime behavior in the frontend test suite.
 */

const automatedQueryRuntimeModule = require('../../src/main/ipc/ipc_automated_query_dispatcher.cjs');
const {
  createAutomatedQueryRuntime,
} = automatedQueryRuntimeModule;
const fs = require('fs/promises');
const path = require('path');

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
    attachAgentDefinitionContextToPayload: jest.fn((payload) => ({
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
  const runtime = createAutomatedQueryRuntime(deps);

  return {
    deps,
    runtime,
    getState: () => ({
      currentConversationRef,
      isFirstQuery,
    }),
  };
}

describe('ipc_automated_query_dispatcher', () => {
  const retiredDispatcherExport = `${['createAutomatedQuery', 'Dispatcher'].join('')},`;

  test('rejects missing query text before connecting', async () => {
    const { deps, runtime } = createHarness({
      prepareAutomatedQueryPayload: jest.fn(() => null),
    });

    await expect(runtime.sendAutomatedQuery({})).resolves.toEqual({
      ok: false,
      error: 'Missing query text',
    });
    expect(deps.ensureBackendConnection).not.toHaveBeenCalled();
  });

  test('returns backend connection errors without dispatching', async () => {
    const { deps, runtime } = createHarness({
      ensureBackendConnection: jest.fn(async () => {
        throw new Error('closed');
      }),
    });

    await expect(runtime.sendAutomatedQuery({ text: 'run this' })).resolves.toEqual({
      ok: false,
      error: 'closed',
    });
    expect(deps.sendQueryThroughAgentSdkRuntime).not.toHaveBeenCalled();
  });

  test('builds and dispatches automated queries through the SDK runtime', async () => {
    const pendingSettings = Promise.resolve();
    const {
      deps,
      runtime,
      getState,
    } = createHarness({
      getPendingSettingsSyncPromise: jest.fn(() => pendingSettings),
    });

    const result = await runtime.sendAutomatedQuery({
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
    const { deps, runtime } = createHarness({
      buildQueryPayload: jest.fn(async () => ({
        payload: {},
        queryUsedInitialContext: false,
        userId: 'user-1',
      })),
    });

    await runtime.sendAutomatedQuery({
      text: 'continue',
      conversationRef: 'conv-existing',
    });

    expect(deps.setCurrentConversationRef).toHaveBeenCalledWith('conv-existing');
    expect(deps.setFirstQuery).not.toHaveBeenCalled();
  });

  test('runtime wrapper exposes automated query dispatch through composed dependencies', async () => {
    const { deps } = createHarness();
    const runtime = createAutomatedQueryRuntime(deps);

    await expect(runtime.sendAutomatedQuery({ text: 'inspect app' })).resolves.toEqual({
      ok: true,
      messageId: 'sdk-message-1',
      queryMessageId: 'query-message-1',
      conversationRef: 'vm-run-generated-conv',
      userId: 'user-1',
    });

    expect(deps.ensureBackendConnection).toHaveBeenCalledWith('automated-query');
    expect(deps.sendQueryThroughAgentSdkRuntime).toHaveBeenCalledTimes(1);
  });

  test('ipc.cjs delegates automated query runtime composition to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_automated_query_dispatcher.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAutomatedQueryRuntime({');
    expect(mainSource).toContain('automatedQueryRuntime.sendAutomatedQuery(options)');
    expect(mainSource).not.toContain('createAutomatedQueryDispatcher({');
    expect(mainSource).not.toContain('automatedQueryDispatcher.sendAutomatedQuery(options)');
    expect(helperSource).toContain('function createAutomatedQueryRuntime');
    expect(helperSource).toContain('createAutomatedQueryDispatcher(deps)');
    expect(automatedQueryRuntimeModule.createAutomatedQueryDispatcher).toBeUndefined();
    expect(helperSource).not.toContain(retiredDispatcherExport);
  });
});
