/** @jest-environment node */

jest.mock('../../packages/windie-sdk-js/cjs/index.js', () => ({
  WindieAgent: {
    startDesktop: jest.fn(),
  },
}));

const {
  WindieAgent,
} = require('../../packages/windie-sdk-js/cjs/index.js');
const {
  createWindieAgentHost,
} = require('../../frontend/src/main/windie_agent_host.cjs');

function createFakeAgent() {
  const listeners = {};
  return {
    listeners,
    close: jest.fn(),
    compactHistory: jest.fn(async () => 'compact-id'),
    ensureConnected: jest.fn(async () => undefined),
    isConnected: jest.fn(() => true),
    noteBackendTraffic: jest.fn(),
    onBackendEvent: jest.fn(listener => {
      listeners.backend = listener;
      return jest.fn();
    }),
    onConversationEvent: jest.fn(listener => {
      listeners.event = listener;
      return jest.fn();
    }),
    onCurrentTurn: jest.fn(listener => {
      listeners.currentTurn = listener;
      return jest.fn();
    }),
    onRows: jest.fn(listener => {
      listeners.rows = listener;
      return jest.fn();
    }),
    onStatus: jest.fn(listener => {
      listeners.status = listener;
      return jest.fn();
    }),
    requestModelList: jest.fn(async () => 'models-id'),
    rehydrateMessages: jest.fn(async () => undefined),
    run: jest.fn(async input => ({
      turnRef: input.turnRef,
      queryMessageId: 'backend-query-id',
    })),
    stop: jest.fn(async () => 'stop-id'),
    syncBackendIdleTimer: jest.fn(),
    updateSettings: jest.fn(async () => 'settings-id'),
    wakewordDetected: jest.fn(async () => 'wakeword-id'),
  };
}

describe('windie_agent_host', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('starts WindieAgent.startDesktop and sends query payloads through the agent', async () => {
    const fakeAgent = createFakeAgent();
    WindieAgent.startDesktop.mockResolvedValue(fakeAgent);
    const host = createWindieAgentHost({
      WebSocketImpl: function FakeWebSocket() {},
      getEndpoint: () => ({
        httpUrl: 'https://api.windieos.com',
        wsUrl: 'wss://api.windieos.com/ws',
        wsOrigin: 'https://app.windieos.com',
      }),
      getEndpointCandidates: () => [],
      getInstallAuthState: () => ({
        installToken: 'install-token',
        installId: 'install-id',
        userId: 'user-1',
      }),
      getUserId: () => 'user-1',
      executeLocalTool: jest.fn(),
    });

    const result = await host.run({
      messageId: 'turn-1',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-1',
      },
    });

    expect(WindieAgent.startDesktop).toHaveBeenCalledWith(expect.objectContaining({
      appName: 'WindieOS',
      backendUrl: 'https://api.windieos.com',
      wsUrl: 'wss://api.windieos.com/ws',
      installToken: 'install-token',
      defaultUserId: 'user-1',
      conversationRef: 'conv-1',
      builtins: 'default',
    }));
    expect(fakeAgent.run).toHaveBeenCalledWith({
      text: 'hello',
      turnRef: 'turn-1',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-1',
      },
    });
    expect(result).toEqual({
      turnRef: 'turn-1',
      queryMessageId: 'backend-query-id',
    });
  });

  test('forwards SDK rows, raw events, current turns, and status to host callbacks', async () => {
    const fakeAgent = createFakeAgent();
    WindieAgent.startDesktop.mockResolvedValue(fakeAgent);
    const callbacks = {
      onConversationEvent: jest.fn(),
      onCurrentTurn: jest.fn(),
      onRawBackendEvent: jest.fn(),
      onRows: jest.fn(),
      onStatus: jest.fn(),
    };
    const host = createWindieAgentHost({
      getEndpoint: () => ({ httpUrl: 'https://api.windieos.com' }),
      getEndpointCandidates: () => [],
      getInstallAuthState: () => ({ userId: 'user-1' }),
      getUserId: () => 'user-1',
      executeLocalTool: jest.fn(),
      ...callbacks,
    });

    await host.ensureConnected({ conversationRef: 'conv-1' });
    fakeAgent.listeners.rows([{ type: 'tool_call' }]);
    fakeAgent.listeners.backend({ type: 'streaming-response' });
    fakeAgent.listeners.event({ type: 'assistant_delta' }, { state: {} });
    fakeAgent.listeners.currentTurn({ conversationRef: 'conv-1', turnRef: 'turn-1' }, { state: {} });
    fakeAgent.listeners.status({ phase: 'running' });

    expect(callbacks.onRows).toHaveBeenCalledWith([{ type: 'tool_call' }]);
    expect(callbacks.onRawBackendEvent).toHaveBeenCalledWith({ type: 'streaming-response' });
    expect(callbacks.onConversationEvent).toHaveBeenCalledWith({ type: 'assistant_delta' }, { state: {} });
    expect(callbacks.onCurrentTurn).toHaveBeenCalledWith({ conversationRef: 'conv-1', turnRef: 'turn-1' }, { state: {} });
    expect(callbacks.onStatus).toHaveBeenCalledWith({ phase: 'running' });
  });
});
