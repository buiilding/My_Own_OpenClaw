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
});
