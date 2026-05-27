const mockCreateSeededConversationStore = jest.fn();
const mockGetActiveConversationRef = jest.fn(() => null);

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient', () => ({
  DesktopTranscriptProjectionRuntimeClient: {
    createSeededConversationStore: (...args: unknown[]) => mockCreateSeededConversationStore(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: (...args: unknown[]) => mockGetActiveConversationRef(...args),
  },
}));

function createSeededStore(events: Array<Record<string, unknown>>) {
  let currentEvents = events;
  return {
    appendEvent: jest.fn(async (event) => {
      currentEvents = [...currentEvents, event];
    }),
    appendEvents: jest.fn(),
    rewriteConversation: jest.fn(async (rewrite) => {
      currentEvents = rewrite.preservedEvents;
    }),
    replaceCompactedReplay: jest.fn(),
    loadEvents: jest.fn(async () => currentEvents),
    loadForDisplay: jest.fn(),
    loadForRehydrate: jest.fn(async () => ({
      conversationRef: 'conv-replay',
      revisionId: 'rev-replay',
      messages: [],
    })),
    listMetadata: jest.fn(),
    getRevision: jest.fn(),
  };
}

describe('DesktopConversationContinuityService', () => {
  beforeEach(() => {
    mockCreateSeededConversationStore.mockReset();
    mockGetActiveConversationRef.mockReset();
    mockGetActiveConversationRef.mockReturnValue(null);
  });

  test('rehydrateMessages routes replace-mode history through the SDK transport', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.rehydrateMessages({
        conversationRef: 'conv-rehydrate',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi', message_type: 'assistant' },
        ],
        workspacePath: ' /workspace/WindieOS ',
      });

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'rehydrate',
        payload: {
          conversation_ref: 'conv-rehydrate',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi', message_type: 'assistant' },
          ],
          rehydrate_mode: 'replace',
          workspace_path: '/workspace/WindieOS',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('prepareEditAndResend cuts canonical sidecar rows and rehydrates without sending', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async (channel) => {
      if (channel === 'get-chat-events') {
        return {
          success: true,
          data: {
            events: [{
              event_payload: {
                type: 'user_message',
                eventId: 'user-1',
                conversationRef: 'conv-replay',
                revisionId: 'rev-1',
                timestamp: '2026-05-17T12:00:00.000Z',
                source: 'ui',
                payload: {
                  id: 'user-1',
                  text: 'old question',
                },
              },
            }],
          },
        };
      }
      return { success: true, data: { message_index: 1 } };
    });
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      const prepared = await DesktopConversationContinuityService.prepareEditAndResend({
        conversationRef: 'conv-replay',
        userId: 'user-1',
        messageId: 'user-1',
        text: 'edited question',
        payload: {
          screenshot_ref: 'artifact-1',
        },
        workspacePath: '/repo',
      });

      expect(invoke).toHaveBeenCalledWith('rewrite-chat-conversation-after-event', expect.objectContaining({
        conversationId: 'conv-replay',
        cutAfterEventId: null,
        event: expect.objectContaining({
          eventType: 'conversation_rewritten',
        }),
      }));
      expect(send).toHaveBeenCalledWith('to-backend', expect.objectContaining({
        type: 'rehydrate',
      }));
      expect(invoke).not.toHaveBeenCalledWith('send-chat-query', expect.anything());
      expect(prepared).toEqual(expect.objectContaining({
        conversationRef: 'conv-replay',
        text: 'edited question',
        payload: expect.objectContaining({
          screenshot_ref: 'artifact-1',
        }),
        workspacePath: '/repo',
      }));
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('prepareRetryTurn cuts canonical sidecar rows and rehydrates without sending', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async (channel) => {
      if (channel === 'get-chat-events') {
        return {
          success: true,
          data: {
            events: [
              {
                event_payload: {
                  type: 'user_message',
                  eventId: 'user-1',
                  conversationRef: 'conv-retry',
                  revisionId: 'rev-1',
                  timestamp: '2026-05-17T12:00:00.000Z',
                  source: 'ui',
                  payload: {
                    id: 'user-1',
                    text: 'retry question',
                  },
                },
              },
              {
                event_payload: {
                  type: 'assistant_message',
                  eventId: 'assistant-1',
                  conversationRef: 'conv-retry',
                  revisionId: 'rev-1',
                  timestamp: '2026-05-17T12:01:00.000Z',
                  source: 'backend',
                  payload: {
                    id: 'assistant-1',
                    text: 'old answer',
                  },
                },
              },
            ],
          },
        };
      }
      return { success: true, data: { message_index: 1 } };
    });
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      const prepared = await DesktopConversationContinuityService.prepareRetryTurn({
        conversationRef: 'conv-retry',
        userId: 'user-1',
        messageId: 'assistant-1',
        payload: {
          screenshot_ref: null,
        },
        workspacePath: '/repo',
      });

      expect(invoke).toHaveBeenCalledWith('rewrite-chat-conversation-after-event', expect.objectContaining({
        conversationId: 'conv-retry',
        cutAfterEventId: null,
        event: expect.objectContaining({
          eventType: 'conversation_rewritten',
        }),
      }));
      expect(send).toHaveBeenCalledWith('to-backend', expect.objectContaining({
        type: 'rehydrate',
      }));
      expect(invoke).not.toHaveBeenCalledWith('send-chat-query', expect.anything());
      expect(prepared).toEqual(expect.objectContaining({
        conversationRef: 'conv-retry',
        text: 'retry question',
        payload: expect.objectContaining({
          screenshot_ref: null,
        }),
        workspacePath: '/repo',
      }));
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('compactHistory routes through the SDK runtime transport', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.compactHistory(false, 'conv-compact');

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'compact-history',
        payload: {
          force: false,
          conversation_ref: 'conv-compact',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('compactHistory falls back to the active conversation ref', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    mockGetActiveConversationRef.mockReturnValue('conv-active');
    window.ipc = {
      send,
      invoke: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.compactHistory();

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'compact-history',
        payload: {
          force: true,
          conversation_ref: 'conv-active',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });
});
