/** @jest-environment node */

const {
  initIpc,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');

const ALL_LOCAL_TOOL_NAMES = Object.freeze([
  'mouse_control',
  'keyboard_control',
  'screenshot',
  'scroll_control',
  'switch_window',
  'wait',
  'get_open_windows',
  'get_system_stats',
  'open_app',
  'run_shell_command',
  'process',
  'read_file',
  'replace',
  'browser',
]);

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
    } = require('../../src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
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
      payload: expect.objectContaining({
        text: 'edited text',
        conversation_ref: 'conv-ipc-display',
        screenshot_refs: ['artifact-one'],
        agent_definition: expect.any(Object),
      }),
      model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
    });
    expect(sdk.runtime.retryTurn).toHaveBeenCalledWith({
      messageId: 'row-assistant',
      turnRef: 'turn-retry',
      payload: expect.objectContaining({
        conversation_ref: 'conv-ipc-display',
        screenshot_ref: 'artifact-one',
        agent_definition: expect.any(Object),
      }),
      model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
    });
  });

  test('edit/resend and retry attach current agent definition context through the shared main helper', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();
    const configPath = '/tmp/appdata/frontend-config.json';
    const persistedAgentConfig = {
      model_provider: 'scripted',
      selected_model_id: 'scripted-runtime',
      agent_custom_instructions: 'Current Agent prompt.',
      agent_disabled_local_tools: ALL_LOCAL_TOOL_NAMES,
      agent_disabled_remote_tools: ['web_search'],
      agent_enabled_mcp_servers: [],
    };
    bridge.fs.existsSync.mockImplementation((targetPath) => targetPath === configPath);
    bridge.fs.readFileSync.mockImplementation((targetPath) => {
      if (targetPath === configPath) {
        return JSON.stringify(persistedAgentConfig);
      }
      throw new Error(`unexpected readFileSync path: ${targetPath}`);
    });

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
        turnRef: 'turn-edit',
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
        turnRef: 'turn-retry',
      }),
    });

    const editPayload = sdk.runtime.editAndResend.mock.calls[0][0].payload;
    expect(editPayload).toMatchObject({
      text: 'edited text',
      conversation_ref: 'conv-ipc-display',
      screenshot_refs: ['artifact-one'],
      workspace_path: '/tmp/replay-workspace',
      metadata: { source: 'edit' },
      agent_definition: {
        system_prompt: {
          mode: 'replace',
          content: 'Current Agent prompt.',
        },
        tools: {
          client_manifest: {
            version: 1,
            tools: [],
          },
          disabled_tools: ALL_LOCAL_TOOL_NAMES.concat(['web_search']),
          enabled_remote_tools: [],
        },
      },
    });
    expect(editPayload.resources).toEqual([{ kind: 'workspace', path: '/tmp/replay-workspace' }]);

    const retryPayload = sdk.runtime.retryTurn.mock.calls[0][0].payload;
    expect(retryPayload).toMatchObject({
      conversation_ref: 'conv-ipc-display',
      screenshot_ref: 'artifact-one',
      workspace_path: '/tmp/replay-workspace',
      agent_definition: {
        system_prompt: {
          mode: 'replace',
          content: 'Current Agent prompt.',
        },
        tools: {
          client_manifest: {
            version: 1,
            tools: [],
          },
          disabled_tools: ALL_LOCAL_TOOL_NAMES.concat(['web_search']),
          enabled_remote_tools: [],
        },
      },
    });
  });

  test('replay runtime-send trace records sanitized counts from enriched context', async () => {
    const appendIpcBridgeDiagnostic = jest.fn();
    const {
      createElectronMainTraceLogger,
    } = require('../../src/main/ipc/ipc_assistant_trace.cjs');
    const tracer = createElectronMainTraceLogger({
      appendIpcBridgeDiagnostic,
      log: jest.fn(),
      stdoutEnabled: false,
    });
    const runtimeRegistry = {
      editAndResend: jest.fn(async input => ({
        turnRef: input.turnRef,
        queryMessageId: 'msg-edit',
      })),
    };
    const enrichedAgentDefinition = {
      mode: 'default_plus_overrides',
      system_prompt: { mode: 'replace', content: 'Secret current prompt.' },
      tools: {
        mode: 'default_plus_client',
        client_manifest: {
          version: 1,
          tools: [],
        },
        disabled_tools: ALL_LOCAL_TOOL_NAMES,
        enabled_remote_tools: [],
      },
    };
    const attachRuntimeTurnContextToPayload = jest.fn(payload => ({
      ...payload,
      agent_definition: enrichedAgentDefinition,
    }));
    const commandRuntime = createDirectCommandRuntime({
      runtimeRegistry,
      attachRuntimeTurnContextToPayload,
      traceRuntimeSend: input => tracer.traceRuntimeSend(input),
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
        turnRef: 'turn-edit',
      }),
    });

    expect(attachRuntimeTurnContextToPayload).toHaveBeenCalledWith(expect.objectContaining({
      text: 'edited private text',
      conversation_ref: 'conv-ipc-display',
      workspace_path: '/tmp/replay-workspace',
    }));
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime.send',
      phase: 'sdk',
      conversationRef: 'conv-ipc-display',
      turnRef: 'turn-edit',
      textLength: 'edited private text'.length,
      hasAgentDefinition: true,
      clientManifestToolCount: 0,
      disabledToolCount: ALL_LOCAL_TOOL_NAMES.length,
      enabledRemoteToolCount: 0,
      systemPromptMode: 'replace',
    }));
    const serializedDiagnostics = JSON.stringify(appendIpcBridgeDiagnostic.mock.calls);
    expect(serializedDiagnostics).not.toContain('edited private text');
    expect(serializedDiagnostics).not.toContain('Secret current prompt.');
    expect(serializedDiagnostics).not.toContain('Stale secret prompt.');
    expect(serializedDiagnostics).not.toContain('Stale secret schema body.');
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
