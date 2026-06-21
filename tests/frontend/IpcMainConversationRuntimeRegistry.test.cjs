/** @jest-environment node */

const {
  initIpc,
  primeQueryContext,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/ipcMainBridgeHarness.cjs');

describe('ipc.cjs conversation runtime registry', () => {
  registerBridgeSuiteLifecycleHooks();

  function installMockAgentClient(options = {}) {
    const runtimes = new Map();
    const pendingSends = [];

    function createRuntime(conversationRef) {
      const subscribers = new Set();
      function emit(event, snapshot) {
        for (const subscriber of subscribers) {
          subscriber(event, snapshot);
        }
      }
      const runtime = {
        conversationRef,
        emit,
        subscribeEvents: jest.fn((listener) => {
          subscribers.add(listener);
          return () => subscribers.delete(listener);
        }),
        load: jest.fn(async () => ({
          display: {
            conversationRef,
            revisionId: '',
            messages: [],
            compaction: { status: 'idle' },
          },
          displayRows: [],
          rehydrate: {
            conversationRef,
            revisionId: '',
            messages: [],
          },
          currentTurn: null,
        })),
        rehydrateMessages: jest.fn(async () => undefined),
        stop: jest.fn(async () => ({ stopped: true })),
        send: jest.fn((input = {}) => {
          const turnRef = input.turnRef || input.turn_ref || `turn-${conversationRef}`;
          const complete = () => {
            const snapshot = {
              display: null,
              displayRows: [],
              rehydrate: { conversationRef, revisionId: '', messages: [] },
              currentTurn: {
                conversationRef,
                turnRef,
                phase: 'complete',
              },
            };
            emit({
              type: 'turn_completed',
              conversationRef,
              turnRef,
              payload: {},
            }, snapshot);
          };
          if (options.holdSends) {
            return new Promise((resolve) => {
              pendingSends.push(() => {
                complete();
                resolve({ turnRef, queryMessageId: turnRef });
              });
            });
          }
          complete();
          return Promise.resolve({ turnRef, queryMessageId: turnRef });
        }),
        close: jest.fn(),
      };
      runtimes.set(conversationRef, runtime);
      return runtime;
    }

    const agent = {
      id: 'agent-registry',
      conversation: jest.fn((input = {}) => (
        runtimes.get(input.conversationRef) || createRuntime(input.conversationRef)
      )),
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
      runtimes,
      pendingSends,
      wakeUp,
      AgentClient,
    };
  }

  function invokeAgentSdkCommandHandler(handlers, command, payload = {}, sender = null) {
    return handlers['windie:invoke']({ sender }, {
      command,
      payload,
    });
  }

  async function waitForRuntimeSend(sdk, conversationRef) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const runtime = sdk.runtimes.get(conversationRef);
      if (runtime?.send.mock.calls.length === 1) {
        return runtime;
      }
      await new Promise(resolve => setImmediate(resolve));
    }
    throw new Error(`Timed out waiting for runtime send in ${conversationRef}`);
  }

  afterEach(() => {
    jest.dontMock('../../packages/windie-sdk-js/cjs/runtime/AgentClient.js');
  });

  test('keeps conversation A runtime attached when sending in conversation B', async () => {
    const sdk = installMockAgentClient();
    const bridge = initIpc();
    primeQueryContext(bridge.backendBridge);

    await invokeAgentSdkCommandHandler(bridge.handlers, 'conversation.send', {
      text: 'first chat',
      conversation_ref: 'conv-a',
    });
    await invokeAgentSdkCommandHandler(bridge.handlers, 'conversation.send', {
      text: 'second chat',
      conversation_ref: 'conv-b',
    });

    expect(sdk.agent.conversation).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-a',
    }));
    expect(sdk.agent.conversation).toHaveBeenCalledWith(expect.objectContaining({
      conversationRef: 'conv-b',
    }));
    expect(sdk.runtimes.get('conv-a').close).not.toHaveBeenCalled();
    expect(sdk.runtimes.get('conv-b').close).not.toHaveBeenCalled();
    expect(sdk.runtimes.get('conv-a').send).toHaveBeenCalledTimes(1);
    expect(sdk.runtimes.get('conv-b').send).toHaveBeenCalledTimes(1);

    sdk.runtimes.get('conv-a').emit({
      type: 'assistant_delta',
      conversationRef: 'conv-a',
      turnRef: 'turn-conv-a-late',
      payload: { text: 'late A' },
    }, {
      display: null,
      displayRows: [{
        id: 'row-a-late',
        conversationRef: 'conv-a',
        turnRef: 'turn-conv-a-late',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'late A',
      }],
      rehydrate: { conversationRef: 'conv-a', revisionId: '', messages: [] },
      currentTurn: {
        conversationRef: 'conv-a',
        turnRef: 'turn-conv-a-late',
        phase: 'streaming',
      },
    });

    expect(bridge.mainWindow.webContents.send).toHaveBeenCalledWith(
      'windie:rows',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'row-a-late',
          conversationRef: 'conv-a',
        }),
      ]),
    );
  });

  test('rejects a second send in the same conversation while its runtime is active', async () => {
    const sdk = installMockAgentClient({ holdSends: true });
    const bridge = initIpc();
    primeQueryContext(bridge.backendBridge);

    const firstSend = invokeAgentSdkCommandHandler(bridge.handlers, 'conversation.send', {
      text: 'first chat',
      conversation_ref: 'conv-active',
    });

    const activeRuntime = await waitForRuntimeSend(sdk, 'conv-active');

    const secondSend = await invokeAgentSdkCommandHandler(bridge.handlers, 'conversation.send', {
      text: 'overlap chat',
      conversation_ref: 'conv-active',
    });

    expect(secondSend).toEqual({
      ok: true,
      data: {
        ok: false,
        error: 'Failed to send query through Agent SDK runtime',
      },
    });
    expect(secondSend.data).toEqual({
      ok: false,
      error: 'Failed to send query through Agent SDK runtime',
    });
    expect(activeRuntime.send).toHaveBeenCalledTimes(1);

    sdk.pendingSends.shift()?.();
    await expect(firstSend).resolves.toEqual(expect.objectContaining({
      ok: true,
    }));
  });
});
