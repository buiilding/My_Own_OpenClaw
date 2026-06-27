/** @jest-environment node */

const querySendRuntimeModule = require('../../src/main/ipc/ipc_query_send_runtime.cjs');

const {
  createRendererQuerySendRuntime,
} = querySendRuntimeModule;

function buildDeps(overrides = {}) {
  return {
    BrowserWindow: {},
    screen: {},
    runBeforeOverlayQueryCapture: jest.fn(() => Promise.resolve()),
    onBeforeOverlayQueryCapture: jest.fn(),
    log: jest.fn(),
    prepareRendererQueryPayload: jest.fn(() => ({
      payload: {
        text: 'hello',
        conversation_ref: 'conv-test',
        screenshot_ref: 'shot-1',
      },
      attachmentContext: null,
      conversationRef: 'conv-test',
      memoryRetrievalEnabled: false,
      queryMessageId: 'turn-test',
    })),
    resolveConversationRefFromPayload: jest.fn(() => 'conv-test'),
    uuidGenerator: jest.fn(() => 'turn-generated'),
    logChatPillMainTrace: jest.fn(),
    setResponseOverlayPhase: jest.fn(),
    broadcastToRenderers: jest.fn(),
    resolvePreferredArtifactHttpUrl: jest.fn(() => 'http://backend.test'),
    getWindows: jest.fn(() => ({ mainWindow: {}, chatWindow: {} })),
    setActiveDisplayAffinity: jest.fn(),
    resolveActiveSurfaceDisplayAffinity: jest.fn(() => 'display-affinity'),
    ipcEventReplayState: {
      startTurn: jest.fn(),
    },
    buildQueryPayload: jest.fn(({ basePayload }) => Promise.resolve({
      payload: {
        ...basePayload,
        system_state: { ready: true },
      },
      queryUsedInitialContext: false,
    })),
    buildQueryPayloadContext: jest.fn(),
    ...overrides,
  };
}

describe('ipc_query_send_runtime', () => {
  test('keeps lower-level query send helpers private behind the runtime facade', () => {
    expect(querySendRuntimeModule.prepareRendererQuerySend).toBeUndefined();
    expect(querySendRuntimeModule.handleRendererQuerySendFailure).toBeUndefined();
  });

  test('prepares query context without broadcasting a synthetic local user message', async () => {
    const deps = buildDeps();
    const order = [];
    deps.broadcastToRenderers.mockImplementation(() => {
      order.push('broadcast');
    });
    deps.buildQueryPayload.mockImplementation(async ({ basePayload }) => {
      order.push('build-query-payload');
      return {
        payload: basePayload,
        queryUsedInitialContext: false,
      };
    });
    const runtime = createRendererQuerySendRuntime({ deps });

    await runtime.prepare({
      event: { sender: { id: 1 } },
      payload: { text: 'hello', conversation_ref: 'conv-test' },
      currentConversationRef: 'conv-test',
      currentSessionId: 'session-test',
      currentServerUserId: 'user-server',
      currentUserId: 'user-local',
      isFirstQuery: false,
    });

    expect(order).toEqual(['build-query-payload']);
    expect(deps.broadcastToRenderers).not.toHaveBeenCalled();
  });
});
