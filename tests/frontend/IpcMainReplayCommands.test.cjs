/** @jest-environment node */

const {
  initIpc,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');

describe('ipc.cjs replay command handling', () => {
  registerBridgeSuiteLifecycleHooks();

  function installMockAgentClient() {
    const runtime = {
      subscribeEvents: jest.fn(() => jest.fn()),
      load: jest.fn(async () => ({
        display: null,
        displayRows: [],
        rehydrate: {
          messages: [],
        },
        currentTurn: null,
      })),
      loadDisplayTimeline: jest.fn(async () => ({
        conversationRef: 'conv-ipc-display',
        revisionId: 'rev-display',
        createdAt: '2026-06-22T12:00:00.000Z',
        rows: [],
      })),
      replaceRows: jest.fn(async input => ({
        conversationRef: 'conv-ipc-display',
        revisionId: 'rev-child',
        createdAt: '2026-06-22T12:01:00.000Z',
        reason: input.reason,
        baseRevisionId: input.baseRevisionId,
        rows: input.rows,
      })),
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
          conversationRef: 'conv-ipc-display',
          revisionId: input.revisionId,
          rows: [],
        },
        modelHistoryCheckpoint: null,
      })),
      fork: jest.fn(async input => ({
        conversationRef: input.newConversationRef,
        revisionId: 'rev-forked',
        sourceConversationRef: 'conv-ipc-display',
        sourceRevisionId: input.sourceRevisionId || 'rev-display',
        cutAfterRowId: input.cutAfterRowId,
        displayRowCount: 2,
        modelHistoryRowCount: 2,
      })),
      close: jest.fn(),
    };
    const agent = {
      id: 'agent-replay',
      conversation: jest.fn(() => runtime),
      subscribeRawBackendEvents: jest.fn(() => jest.fn()),
      ensureConnected: jest.fn(async () => undefined),
      isConnected: jest.fn(() => true),
      listConversationRevisions: jest.fn(async () => [
        {
          conversationRef: 'conv-ipc-display',
          revisionId: 'rev-display',
          active: true,
        },
      ]),
      noteBackendTraffic: jest.fn(),
      syncBackendIdleTimer: jest.fn(),
      status: jest.fn(() => ({ phase: 'ready' })),
      sleep: jest.fn(),
    };
    const wakeUp = jest.fn(async () => agent);
    const AgentClient = jest.fn().mockImplementation(() => ({ wakeUp }));
    const sdkActual = jest.requireActual(
      '../../packages/windie-sdk-js/cjs/runtime/AgentClient.js',
    );

    jest.doMock('../../packages/windie-sdk-js/cjs/runtime/AgentClient.js', () => ({
      ...sdkActual,
      AgentClient,
    }));

    return {
      agent,
      runtime,
      wakeUp,
      AgentClient,
    };
  }

  function invokeAgentSdkCommandHandler(handlers, command, payload = {}) {
    return handlers['windie:invoke']({ sender: null }, {
      command,
      payload,
    });
  }

  afterEach(() => {
    jest.dontMock('../../packages/windie-sdk-js/cjs/runtime/AgentClient.js');
  });

  test('routes display timeline load and replacement through the Agent SDK runtime adapter', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.loadDisplayTimeline',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        revisionId: 'rev-display',
      }),
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.replaceRows',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        baseRevisionId: 'rev-display',
        reason: 'retry',
        rows: [],
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        revisionId: 'rev-child',
      }),
    });

    expect(sdk.runtime.loadDisplayTimeline).toHaveBeenCalledWith({
      revisionId: null,
    });
    expect(sdk.runtime.replaceRows).toHaveBeenCalledWith({
      baseRevisionId: 'rev-display',
      reason: 'retry',
      rows: [],
    });
  });

  test('routes edit/resend and retry through the Agent SDK runtime adapter', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.editAndResend',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        messageId: 'row-user',
        text: 'edited text',
        turnRef: 'turn-edit',
        payload: { screenshot_refs: ['artifact-one'] },
        model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        turnRef: 'turn-edit',
        queryMessageId: 'msg-edit',
      }),
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.retryTurn',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        messageId: 'row-assistant',
        turnRef: 'turn-retry',
        payload: { screenshot_ref: 'artifact-one' },
        model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        turnRef: 'turn-retry',
        queryMessageId: 'msg-retry',
      }),
    });

    expect(sdk.runtime.editAndResend).toHaveBeenCalledWith({
      messageId: 'row-user',
      text: 'edited text',
      turnRef: 'turn-edit',
      payload: { screenshot_refs: ['artifact-one'] },
      model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
    });
    expect(sdk.runtime.retryTurn).toHaveBeenCalledWith({
      messageId: 'row-assistant',
      turnRef: 'turn-retry',
      payload: { screenshot_ref: 'artifact-one' },
      model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
    });
  });

  test('routes revision checkout and fork through the Agent SDK runtime adapter', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.checkoutRevision',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        revisionId: 'rev-child',
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        displayTimeline: expect.objectContaining({
          revisionId: 'rev-child',
        }),
      }),
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.fork',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        sourceRevisionId: 'rev-display',
        cutAfterRowId: 'row-assistant',
        newConversationRef: 'conv-forked',
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        conversationRef: 'conv-forked',
        revisionId: 'rev-forked',
      }),
    });

    expect(sdk.runtime.checkoutRevision).toHaveBeenCalledWith({
      revisionId: 'rev-child',
    });
    expect(sdk.runtime.fork).toHaveBeenCalledWith({
      sourceRevisionId: 'rev-display',
      cutAfterRowId: 'row-assistant',
      newConversationRef: 'conv-forked',
    });
  });

  test('routes revision list lookup through the Agent SDK', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.listRevisions',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        limit: 25,
      },
    )).resolves.toEqual({
      ok: true,
      data: [
        expect.objectContaining({
          revisionId: 'rev-display',
          active: true,
        }),
      ],
    });

    expect(sdk.agent.listConversationRevisions).toHaveBeenCalledWith({
      conversationRef: 'conv-ipc-display',
      limit: 25,
    });
  });
});
