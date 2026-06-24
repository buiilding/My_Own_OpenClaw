/**
 * Covers desktop conversation continuity service. behavior in the frontend test suite.
 */

const mockGetActiveConversationRef = jest.fn(() => null);

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: (...args: unknown[]) => mockGetActiveConversationRef(...args),
  },
}));

describe('DesktopConversationContinuityService', () => {
  beforeEach(() => {
    mockGetActiveConversationRef.mockReset();
    mockGetActiveConversationRef.mockReturnValue(null);
  });

  test('loadDisplayTimeline routes through the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: {
          conversationRef: 'conv-display',
          revisionId: 'rev-display',
          createdAt: '2026-06-22T12:00:00.000Z',
          rows: [],
        },
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.loadDisplayTimeline(
        'user-1',
        'conv-display',
      )).resolves.toEqual(expect.objectContaining({
        revisionId: 'rev-display',
      }));
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.loadDisplayTimeline',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
          revisionId: undefined,
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('loadDisplayRows prefers ConversationView rows from the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: {
          view: {
            displayRows: [
              {
                id: 'row-view',
                conversationRef: 'conv-display',
                role: 'assistant',
                type: 'assistant_message',
                content: 'from view',
              },
            ],
          },
          displayRows: [
            {
              id: 'row-legacy',
              conversationRef: 'conv-display',
              role: 'assistant',
              type: 'assistant_message',
              content: 'legacy',
            },
          ],
        },
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.loadDisplayRows(
        'user-1',
        'conv-display',
      )).resolves.toEqual([
        {
          id: 'row-view',
          conversationRef: 'conv-display',
          role: 'assistant',
          type: 'assistant_message',
          content: 'from view',
        },
      ]);
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.loadDisplay',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('replaceRows routes display timeline replacement through the SDK command bridge', async () => {
    const originalIpc = window.ipc;
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(async () => ({
        ok: true,
        data: {
          conversationRef: 'conv-display',
          revisionId: 'rev-child',
          createdAt: '2026-06-22T12:01:00.000Z',
          rows: [],
        },
      })),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await expect(DesktopConversationContinuityService.replaceRows({
        userId: 'user-1',
        conversationRef: 'conv-display',
        baseRevisionId: 'rev-base',
        reason: 'retry',
        rows: [],
      })).resolves.toEqual(expect.objectContaining({
        revisionId: 'rev-child',
      }));
      expect(window.ipc.invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.replaceRows',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-display',
          baseRevisionId: 'rev-base',
          reason: 'retry',
          rows: [],
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
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
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
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
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
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
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
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
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
