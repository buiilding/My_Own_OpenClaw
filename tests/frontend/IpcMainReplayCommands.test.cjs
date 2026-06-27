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
        conversationRef: input.newConversationRef || 'conv-forked',
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

  function createDirectCommandRuntime({
    runtimeRegistry,
    attachRuntimeTurnContextToPayload,
    traceRuntimeSend,
  } = {}) {
    const {
      createAgentSdkInvokeHandlerRuntime,
    } = require('../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    const handlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    const deps = {
      getState: jest.fn(() => ({ currentUserId: 'registered-user-1' })),
      ensureAgent: jest.fn(async () => runtimeRegistry),
      attachRuntimeTurnContextToPayload,
      traceRuntimeSend,
      appendAppDiagnostic: jest.fn(input => input),
    };
    const runtime = createAgentSdkInvokeHandlerRuntime({
      invokeChannel: 'windie:invoke',
      deps,
    });
    runtime.register({
      ipcMain,
      handleRendererChatQuery: jest.fn(),
      handleRendererStopQuery: jest.fn(),
    });
    return {
      deps,
      invoke: (command, payload = {}) => handlers['windie:invoke']({ sender: null }, {
        command,
        payload,
      }),
    };
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
        queryMessageId: 'msg-retry',
      }),
    });

    expect(sdk.runtime.editAndResend).toHaveBeenCalledWith({
      messageId: 'row-user',
      text: 'edited text',
    });
    expect(sdk.runtime.retryTurn).toHaveBeenCalledWith({
      messageId: 'row-assistant',
    });
  });

  test('forwards replay edit text without main-process trimming', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.editAndResend',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        messageId: 'row-user',
        text: '  edited text  ',
        turnRef: 'turn-edit',
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        queryMessageId: 'msg-edit',
      }),
    });

    expect(sdk.runtime.editAndResend).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'row-user',
      text: '  edited text  ',
    }));
    expect(sdk.runtime.editAndResend.mock.calls[0][0]).not.toHaveProperty('payload');
    expect(sdk.runtime.editAndResend.mock.calls[0][0]).not.toHaveProperty('turnRef');
  });

  test('rejects padded replay command identities instead of repairing them', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.editAndResend',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        messageId: ' row-user ',
        text: 'edited text',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact message id.',
    });
    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.retryTurn',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        messageId: ' row-assistant ',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact message id.',
    });
    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.retryTurn',
      {
        userId: 'registered-user-1',
        conversationRef: ' conv-ipc-display ',
        messageId: 'row-assistant',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact conversation reference.',
    });
    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.retryTurn',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact message id.',
    });

    expect(sdk.runtime.editAndResend).not.toHaveBeenCalled();
    expect(sdk.runtime.retryTurn).not.toHaveBeenCalled();
  });

  test('edit/resend and retry ignore caller-supplied replay shaping fields', async () => {
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
        payload: {
          screenshot_refs: ['artifact-one'],
          workspace_path: '/tmp/replay-workspace',
          resources: [{ kind: 'workspace', path: '/tmp/replay-workspace' }],
          metadata: { source: 'edit' },
          agent_definition: {
            system_prompt: { mode: 'replace', content: 'Stale prompt.' },
            tools: {
              mode: 'default_plus_client',
              client_manifest: {
                version: 1,
                tools: [
                  {
                    name: 'mouse_control',
                    schema: { type: 'object', description: 'stale schema body' },
                  },
                ],
              },
              disabled_tools: [],
              enabled_remote_tools: ['web_search'],
            },
          },
        },
        model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
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
        payload: {
          screenshot_ref: 'artifact-one',
          workspace_path: '/tmp/replay-workspace',
          agent_definition: {
            system_prompt: { mode: 'replace', content: 'Retry stale prompt.' },
            tools: {
              mode: 'default_plus_client',
              client_manifest: {
                version: 1,
                tools: [
                  {
                    name: 'browser',
                    schema: { type: 'object', description: 'retry stale schema body' },
                  },
                ],
              },
              disabled_tools: [],
              enabled_remote_tools: ['web_search'],
            },
          },
        },
        model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      },
    )).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        queryMessageId: 'msg-retry',
      }),
    });

    expect(sdk.runtime.editAndResend).toHaveBeenCalledWith({
      messageId: 'row-user',
      text: 'edited text',
    });
    expect(sdk.runtime.retryTurn).toHaveBeenCalledWith({
      messageId: 'row-assistant',
    });
    expect(sdk.runtime.editAndResend.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(sdk.runtime.editAndResend.mock.calls[0][0]).not.toHaveProperty('payload');
    expect(sdk.runtime.editAndResend.mock.calls[0][0]).not.toHaveProperty('model');
    expect(sdk.runtime.retryTurn.mock.calls[0][0]).not.toHaveProperty('turnRef');
    expect(sdk.runtime.retryTurn.mock.calls[0][0]).not.toHaveProperty('payload');
    expect(sdk.runtime.retryTurn.mock.calls[0][0]).not.toHaveProperty('model');
  });

  test('replay commands do not use query runtime context enrichment or send tracing', async () => {
    const runtimeRegistry = {
      editAndResend: jest.fn(async input => ({
        queryMessageId: 'msg-edit',
      })),
    };
    const attachRuntimeTurnContextToPayload = jest.fn(payload => ({
      ...payload,
      agent_definition: { system_prompt: { content: 'must not be attached' } },
    }));
    const traceRuntimeSend = jest.fn();
    const commandRuntime = createDirectCommandRuntime({
      runtimeRegistry,
      attachRuntimeTurnContextToPayload,
      traceRuntimeSend,
    });

    await expect(commandRuntime.invoke('conversation.editAndResend', {
      userId: 'registered-user-1',
      conversationRef: 'conv-ipc-display',
      messageId: 'row-user',
      text: 'edited private text',
      turnRef: 'turn-edit',
      payload: {
        workspace_path: '/tmp/replay-workspace',
        agent_definition: {
          system_prompt: { mode: 'replace', content: 'Stale secret prompt.' },
          tools: {
            client_manifest: {
              version: 1,
              tools: [
                {
                  name: 'stale_tool',
                  schema: { description: 'Stale secret schema body.' },
                },
              ],
            },
          },
        },
      },
    })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        queryMessageId: 'msg-edit',
      }),
    });

    expect(attachRuntimeTurnContextToPayload).not.toHaveBeenCalled();
    expect(traceRuntimeSend).not.toHaveBeenCalled();
    expect(runtimeRegistry.editAndResend).toHaveBeenCalledWith({
      messageId: 'row-user',
      text: 'edited private text',
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
      cutAfterRowId: undefined,
    });
  });

  test('rejects padded revision command identities instead of repairing them', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.loadDisplayTimeline',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        revisionId: ' rev-child ',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact revision id.',
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.checkoutRevision',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        revisionId: ' rev-child ',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact revision id.',
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.listRevisions',
      {
        userId: 'registered-user-1',
        conversationRef: ' conv-ipc-display ',
        limit: 25,
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact conversation reference.',
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.fork',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        sourceRevisionId: ' rev-display ',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact source revision id.',
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.fork',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        sourceRevisionId: 'rev-display',
        cutAfterRowId: ' row-cut ',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact cut row id.',
    });

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.fork',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-display',
        sourceRevisionId: 'rev-display',
        newConversationRef: ' conv-new ',
      },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent SDK command requires exact new conversation reference.',
    });

    expect(sdk.runtime.loadDisplayTimeline).not.toHaveBeenCalled();
    expect(sdk.runtime.checkoutRevision).not.toHaveBeenCalled();
    expect(sdk.agent.listConversationRevisions).not.toHaveBeenCalled();
    expect(sdk.runtime.fork).not.toHaveBeenCalled();
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
