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

  test('prepareEditAndResend routes replay preparation through the SDK command bridge', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async (channel, payload) => {
      if (channel === 'windie:invoke') {
        return {
          ok: true,
          data: {
            conversationRef: payload.payload.conversationRef,
            text: payload.payload.text,
            payload: payload.payload.payload,
            workspacePath: payload.payload.workspace_path,
            turnRef: 'turn-edit',
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

      expect(invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.prepareEditAndResend',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-replay',
          messageId: 'user-1',
          userMessageOrdinal: undefined,
          text: 'edited question',
          payload: {
            screenshot_ref: 'artifact-1',
          },
          model: undefined,
          workspace_path: '/repo',
        },
      });
      expect(invoke).not.toHaveBeenCalledWith('windie:invoke', expect.objectContaining({
        command: 'conversation.send',
      }));
      expect(prepared).toEqual(expect.objectContaining({
        conversationRef: 'conv-replay',
        text: 'edited question',
        payload: expect.objectContaining({
          screenshot_ref: 'artifact-1',
        }),
        workspacePath: '/repo',
        turnRef: 'turn-edit',
      }));
    } finally {
      window.ipc = originalIpc;
    }
  });

  test('prepareRetryTurn routes replay preparation through the SDK command bridge', async () => {
    const send = jest.fn();
    const invoke = jest.fn(async (channel, payload) => {
      if (channel === 'windie:invoke') {
        return {
          ok: true,
          data: {
            conversationRef: payload.payload.conversationRef,
            text: 'retry question',
            payload: payload.payload.payload,
            workspacePath: payload.payload.workspace_path,
            turnRef: 'turn-retry',
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

      expect(invoke).toHaveBeenCalledWith('windie:invoke', {
        command: 'conversation.prepareRetryTurn',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-retry',
          messageId: 'assistant-1',
          userMessageOrdinal: undefined,
          payload: {
            screenshot_ref: null,
          },
          model: undefined,
          workspace_path: '/repo',
        },
      });
      expect(invoke).not.toHaveBeenCalledWith('windie:invoke', expect.objectContaining({
        command: 'conversation.send',
      }));
      expect(prepared).toEqual(expect.objectContaining({
        conversationRef: 'conv-retry',
        text: 'retry question',
        payload: expect.objectContaining({
          screenshot_ref: null,
        }),
        workspacePath: '/repo',
        turnRef: 'turn-retry',
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
