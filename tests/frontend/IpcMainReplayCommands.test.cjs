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
      prepareEditAndResend: jest.fn(async input => ({
        text: input.text,
        turnRef: input.turnRef || null,
        payload: {
          prepared: true,
          ...(input.payload || {}),
        },
      })),
      prepareRetryTurn: jest.fn(async input => ({
        text: 'retry text',
        turnRef: input.turnRef || null,
        payload: {
          retry: true,
          ...(input.payload || {}),
        },
      })),
      close: jest.fn(),
    };
    const agent = {
      id: 'agent-replay',
      conversation: jest.fn(() => runtime),
      subscribeRawBackendEvents: jest.fn(() => jest.fn()),
      ensureConnected: jest.fn(async () => undefined),
      isConnected: jest.fn(() => true),
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

  test('routes edit/resend preparation through the real windie:invoke command bridge', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    const response = await invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.prepareEditAndResend',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-replay',
        workspace_path: '/tmp/project-alpha-workspace',
        messageId: 'renderer-user-2',
        text: 'edited second question',
        turnRef: 'turn-edited',
        payload: {
          screenshot_ref: 'artifact-old',
        },
        model: {
          provider: 'anthropic',
          id: 'claude-sonnet-4-5',
        },
      },
    );

    expect(response).toEqual({
      ok: true,
      data: expect.objectContaining({
        conversationRef: 'conv-ipc-replay',
        workspacePath: '/tmp/project-alpha-workspace',
        text: 'edited second question',
        turnRef: 'turn-edited',
        payload: expect.objectContaining({
          prepared: true,
          screenshot_ref: 'artifact-old',
        }),
      }),
    });
    expect(sdk.AgentClient).toHaveBeenCalledWith(expect.objectContaining({
      autoStartLocalRuntime: false,
    }));
    expect(sdk.wakeUp).toHaveBeenCalledWith(expect.objectContaining({
      builtins: [],
      memory: false,
      persistence: false,
      workspacePath: '/tmp/project-alpha-workspace',
    }));
    expect(sdk.agent.conversation).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-agent-replay',
    }));
    expect(sdk.agent.conversation).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-ipc-replay',
    }));
    expect(sdk.runtime.prepareEditAndResend).toHaveBeenCalledWith({
      messageId: 'renderer-user-2',
      text: 'edited second question',
      turnRef: 'turn-edited',
      payload: {
        screenshot_ref: 'artifact-old',
      },
      model: {
        provider: 'anthropic',
        id: 'claude-sonnet-4-5',
      },
    });
    expect(sdk.runtime.load).toHaveBeenCalledTimes(1);
  });

  test('rejects stale transcript-session users before preparing edit/resend replay', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    await expect(invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.prepareEditAndResend',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-replay',
        messageId: 'renderer-user-1',
        text: 'edited first question',
      },
    )).resolves.toEqual(expect.objectContaining({ ok: true }));

    const staleResponse = await invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.prepareEditAndResend',
      {
        userId: 'user-stale',
        conversationRef: 'conv-ipc-replay',
        messageId: 'renderer-user-2',
        text: 'edited stale question',
      },
    );

    expect(staleResponse).toEqual({
      ok: false,
      error: 'Agent SDK command user id does not match the active user.',
    });
    expect(sdk.runtime.prepareEditAndResend).toHaveBeenCalledTimes(1);
  });

  test('routes retry preparation through the same Agent SDK runtime adapter', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();

    const response = await invokeAgentSdkCommandHandler(
      bridge.handlers,
      'conversation.prepareRetryTurn',
      {
        userId: 'registered-user-1',
        conversationRef: 'conv-ipc-retry',
        workspacePath: '/tmp/project-alpha-retry-workspace',
        messageId: 'assistant-retry',
        turnRef: 'turn-retry',
        payload: {
          retry_reason: 'user-requested',
        },
      },
    );

    expect(response).toEqual({
      ok: true,
      data: expect.objectContaining({
        conversationRef: 'conv-ipc-retry',
        workspacePath: '/tmp/project-alpha-retry-workspace',
        text: 'retry text',
        turnRef: 'turn-retry',
        payload: expect.objectContaining({
          retry: true,
          retry_reason: 'user-requested',
        }),
      }),
    });
    expect(sdk.agent.conversation).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-ipc-retry',
    }));
    expect(sdk.runtime.prepareRetryTurn).toHaveBeenCalledWith({
      messageId: 'assistant-retry',
      turnRef: 'turn-retry',
      payload: {
        retry_reason: 'user-requested',
      },
      model: undefined,
    });
  });
});
