/**
 * Covers desktop conversation continuity service. behavior in the frontend test suite.
 */

const mockGetActiveConversationRef = jest.fn(() => null);

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: (...args: unknown[]) => mockGetActiveConversationRef(...args),
  },
}));

describe('DesktopConversationContinuityService', () => {
  beforeEach(() => {
    mockGetActiveConversationRef.mockReset();
    mockGetActiveConversationRef.mockReturnValue(null);
  });

  test('editAndResend routes replay edits through the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: {
          turnRef: 'turn-edit',
          queryMessageId: 'msg-edit',
        },
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.editAndResend({
        userId: 'user-1',
        conversationRef: 'conv-display',
        messageId: 'row-user',
        text: 'edited text',
        payload: { screenshot_refs: ['artifact-one'] },
        model: {
          modelProvider: 'anthropic',
          modelId: 'claude-sonnet-4-5',
        },
      })).resolves.toEqual(expect.objectContaining({
        turnRef: 'turn-edit',
      }));
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.editAndResend',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
          messageId: 'row-user',
          text: 'edited text',
          payload: { screenshot_refs: ['artifact-one'] },
          model: {
            modelProvider: 'anthropic',
            modelId: 'claude-sonnet-4-5',
          },
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('retryTurn routes replay retries through the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: {
          turnRef: 'turn-retry',
          queryMessageId: 'msg-retry',
        },
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.retryTurn({
        userId: 'user-1',
        conversationRef: 'conv-display',
        messageId: 'row-assistant',
        payload: { screenshot_ref: 'artifact-one' },
        model: {
          modelProvider: 'anthropic',
          modelId: 'claude-sonnet-4-5',
        },
      })).resolves.toEqual(expect.objectContaining({
        turnRef: 'turn-retry',
      }));
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.retryTurn',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
          messageId: 'row-assistant',
          payload: { screenshot_ref: 'artifact-one' },
          model: {
            modelProvider: 'anthropic',
            modelId: 'claude-sonnet-4-5',
          },
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('checkoutRevision routes revision selection through the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: {
          displayTimeline: {
            conversationRef: 'conv-display',
            revisionId: 'rev-child',
            rows: [],
          },
          modelHistoryCheckpoint: null,
          view: {
            conversationRef: 'conv-display',
            revisionId: 'rev-child',
            displayRows: [],
          },
        },
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.checkoutRevision({
        userId: 'user-1',
        conversationRef: 'conv-display',
        revisionId: 'rev-child',
      })).resolves.toEqual(expect.objectContaining({
        displayTimeline: expect.objectContaining({
          revisionId: 'rev-child',
        }),
        view: expect.objectContaining({
          revisionId: 'rev-child',
        }),
      }));
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.checkoutRevision',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
          revisionId: 'rev-child',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('listRevisions routes revision metadata lookup through the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: [
          {
            conversationRef: 'conv-display',
            revisionId: 'rev-child',
            parentRevisionId: 'rev-base',
            operation: 'edit',
            active: true,
            updatedAt: '2026-06-22T12:00:00.000Z',
          },
        ],
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.listRevisions(
        'user-1',
        'conv-display',
        25,
      )).resolves.toEqual([
        expect.objectContaining({
          revisionId: 'rev-child',
          active: true,
        }),
      ]);
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.listRevisions',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
          limit: 25,
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('forkConversation routes revision forks through the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: {
          conversationRef: 'conv-forked',
          revisionId: 'rev-forked',
          sourceConversationRef: 'conv-display',
          sourceRevisionId: 'rev-base',
          cutAfterRowId: 'row-assistant',
          displayRowCount: 2,
          modelHistoryRowCount: 2,
        },
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.forkConversation({
        userId: 'user-1',
        conversationRef: 'conv-display',
        sourceRevisionId: 'rev-base',
      })).resolves.toEqual(expect.objectContaining({
        conversationRef: 'conv-forked',
        revisionId: 'rev-forked',
      }));
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.fork',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
          sourceRevisionId: 'rev-base',
          cutAfterRowId: null,
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('compactHistory routes through the SDK runtime transport', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke: jest.fn(async () => ({ ok: true, data: null })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.compactHistory(false, 'conv-compact');

      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.compact',
        payload: {
          force: false,
          conversation_ref: 'conv-compact',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('loadTraceTimeline reads persisted trace rows through the SDK command bridge', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async (channel, payload) => {
      if (channel === 'windie:invoke' && payload.command === 'conversation.load') {
        return {
          ok: true,
          data: {
            state: {
              events: [
                {
                  eventId: 'evt-user',
                  type: 'user_message',
                  conversationRef: 'conv-trace',
                  revisionId: 'rev-1',
                  timestamp: '2026-05-15T12:00:00.000Z',
                  turnRef: 'turn-1',
                  source: 'sdk',
                  payload: { text: 'hello' },
                },
                {
                  eventId: 'evt-trace',
                  type: 'trace_event',
                  conversationRef: 'conv-trace',
                  revisionId: 'rev-1',
                  timestamp: '2026-05-15T12:00:01.000Z',
                  turnRef: 'turn-1',
                  source: 'sdk',
                  payload: {
                    schemaVersion: 1,
                    traceId: 'trace-1',
                    spanId: 'span-1',
                    parentSpanId: null,
                    path: 'memory.retrieval',
                    stage: 'retrieval',
                    status: 'succeeded',
                    runtime: 'sdk',
                  },
                },
              ],
            },
          },
        };
      }
      return { ok: true, data: null };
    });
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      const timeline = await DesktopConversationContinuityService.loadTraceTimeline(
        'user-1',
        'conv-trace',
        { turnRef: 'turn-1', path: 'memory.retrieval' },
      );

      expect(timeline).toEqual([
        expect.objectContaining({
          eventId: 'evt-trace',
          traceId: 'trace-1',
          path: 'memory.retrieval',
          status: 'succeeded',
        }),
      ]);
      expect(invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.load',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-trace',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('searchConversations projects SDK metadata through dashboard row fields', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async (channel, payload) => {
      if (channel === 'windie:invoke' && payload.command === 'conversations.search') {
        return {
          ok: true,
          data: [
            {
              conversationRef: 'conv-search',
              title: 'Search result',
              lastMessage: 'matched text',
              updatedAt: '2026-06-18T18:45:00.000Z',
              eventCount: 4,
              workspacePath: '/repo/project-alpha',
              workspaceName: 'Project Alpha',
              snippet: 'hello <mark>world</mark>',
              matchedRole: 'assistant',
            },
          ],
        };
      }
      return { ok: true, data: null };
    });
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      const results = await DesktopConversationContinuityService.searchConversations({
        userId: 'user-1',
        query: 'world',
        limit: 10,
      });

      expect(invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversations.search',
        payload: {
          userId: 'user-1',
          query: 'world',
          limit: 10,
        },
      });
      expect(results).toEqual([
        {
          conversation_id: 'conv-search',
          record_kind: 'chat_event',
          title: 'Search result',
          last_message: 'matched text',
          last_timestamp: '2026-06-18T18:45:00.000Z',
          entry_count: 4,
          workspace_path: '/repo/project-alpha',
          workspace_name: 'Project Alpha',
          snippet: 'hello <mark>world</mark>',
          matched_role: 'assistant',
        },
      ]);
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
      invoke: jest.fn(async () => ({ ok: true, data: null })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.compactHistory();

      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.compact',
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
