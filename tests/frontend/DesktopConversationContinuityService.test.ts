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

  test('editAndResend seeds replay rows through the projection runtime before sending', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async () => ({ ok: true, messageId: 'query-1' }));
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const store = createSeededStore([
      {
        type: 'user_message',
        eventId: 'user-1',
        conversationRef: 'conv-replay',
        revisionId: 'rev-1',
        source: 'ui',
        payload: {
          id: 'user-1',
          text: 'old question',
        },
      },
    ]);
    mockCreateSeededConversationStore.mockResolvedValueOnce(store);
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.editAndResend({
        conversationRef: 'conv-replay',
        userId: 'user-1',
        messageId: 'user-1',
        text: 'edited question',
        projectionEntries: [
          { messageId: 'user-1', role: 'user', content: 'old question' },
        ],
        payload: {
          screenshot_ref: 'artifact-1',
        },
        workspacePath: '/repo',
      });

      expect(mockCreateSeededConversationStore).toHaveBeenCalledWith({
        conversationRef: 'conv-replay',
        userId: 'user-1',
        projectionEntries: [
          { messageId: 'user-1', role: 'user', content: 'old question' },
        ],
      });
      expect(store.rewriteConversation).toHaveBeenCalledWith(expect.objectContaining({
        conversationRef: 'conv-replay',
        reason: 'edit_resend',
        replacementUserMessage: { text: 'edited question' },
      }));
      expect(invoke).toHaveBeenCalledWith('send-chat-query', expect.objectContaining({
        text: 'edited question',
        conversation_ref: 'conv-replay',
        screenshot_ref: 'artifact-1',
        workspace_path: '/repo',
      }));
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('retryTurn seeds replay rows through the projection runtime before resending the previous user text', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async () => ({ ok: true, messageId: 'query-1' }));
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const store = createSeededStore([
      {
        type: 'user_message',
        eventId: 'user-1',
        conversationRef: 'conv-retry',
        revisionId: 'rev-1',
        source: 'ui',
        payload: {
          id: 'user-1',
          text: 'retry question',
        },
      },
      {
        type: 'assistant_message',
        eventId: 'assistant-1',
        conversationRef: 'conv-retry',
        revisionId: 'rev-1',
        source: 'backend',
        payload: {
          id: 'assistant-1',
          text: 'old answer',
        },
      },
    ]);
    mockCreateSeededConversationStore.mockResolvedValueOnce(store);
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.retryTurn({
        conversationRef: 'conv-retry',
        userId: 'user-1',
        messageId: 'assistant-1',
        projectionEntries: [
          { messageId: 'user-1', role: 'user', content: 'retry question' },
          { messageId: 'assistant-1', role: 'assistant', content: 'old answer' },
        ],
        payload: {
          screenshot_ref: null,
        },
        workspacePath: '/repo',
      });

      expect(mockCreateSeededConversationStore).toHaveBeenCalledWith({
        conversationRef: 'conv-retry',
        userId: 'user-1',
        projectionEntries: [
          { messageId: 'user-1', role: 'user', content: 'retry question' },
          { messageId: 'assistant-1', role: 'assistant', content: 'old answer' },
        ],
      });
      expect(store.rewriteConversation).toHaveBeenCalledWith(expect.objectContaining({
        conversationRef: 'conv-retry',
        reason: 'retry',
        replacementUserMessage: { text: 'retry question' },
      }));
      expect(invoke).toHaveBeenCalledWith('send-chat-query', expect.objectContaining({
        text: 'retry question',
        conversation_ref: 'conv-retry',
        workspace_path: '/repo',
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
