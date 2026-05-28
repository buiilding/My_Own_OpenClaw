/** @jest-environment node */

const {
  prepareRendererQuerySend,
} = require('../../frontend/src/main/ipc/ipc_query_send_runtime.cjs');
const {
  buildLocalUserMessage,
} = require('../../frontend/src/main/ipc/ipc_query_events.cjs');
const {
  buildConversationEventFromBackendEvent,
} = require('../../frontend/src/main/ipc_conversation_event_broadcast.cjs');

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
    buildConversationEventFromBackendEvent,
    buildLocalUserMessage,
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
    getSystemState: jest.fn(),
    searchMemory: jest.fn(),
    ...overrides,
  };
}

describe('ipc_query_send_runtime', () => {
  test('broadcasts accepted local user message before expensive query context build', async () => {
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

    await prepareRendererQuerySend({
      event: { sender: { id: 1 } },
      payload: { text: 'hello', conversation_ref: 'conv-test' },
      currentConversationRef: 'conv-test',
      currentSessionId: 'session-test',
      currentServerUserId: 'user-server',
      currentUserId: 'user-local',
      isFirstQuery: false,
      deps,
    });

    expect(order).toEqual(['broadcast', 'build-query-payload']);
    expect(deps.broadcastToRenderers).toHaveBeenCalledWith(
      'windie:conversation-event',
      expect.objectContaining({
        type: 'user_message',
        conversationRef: 'conv-test',
        turnRef: 'turn-test',
        payload: expect.objectContaining({
          text: 'hello',
          screenshotRef: 'shot-1',
          screenshotUrl: 'http://backend.test/api/artifacts/shot-1',
          sourceEventType: 'local-user-message',
        }),
      }),
    );
  });
});
