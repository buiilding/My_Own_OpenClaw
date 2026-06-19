/**
 * Covers desktop chat stream event runtime. behavior in the frontend test suite.
 */

import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  isSupportedConversationStreamEvent,
  isToolDisplayOnlyConversationStreamEvent,
  recordTrackingEvent,
  shouldIgnoreConversationEventForStaleTurn,
} from '../../frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime';

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'streaming-response',
    payload: {},
    user_id: 'default_user',
    ...overrides,
  } as any;
}

function getWorkspaceState(conversationRef?: string | null) {
  return useChatStore.getState().getWorkspaceState(conversationRef);
}

function shouldIgnore(event: ReturnType<typeof createEvent>, conversationRef?: string | null): boolean {
  return shouldIgnoreConversationEventForStaleTurn(event, conversationRef, { getWorkspaceState });
}

describe('DesktopChatStreamEventRuntime', () => {
  beforeEach(() => {
    useChatStore.setState((state) => ({
      ...state,
      activeConversationRef: null,
      turnConversationRefs: {},
      isSending: false,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-active',
        phase: 'streaming',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: false,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-active',
            phase: 'streaming',
          },
        },
      },
    }));
  });

  test('stale turn guard allows next-turn packets during terminal pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-old',
        phase: 'complete',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'complete',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-new' }), null)).toBe(false);
  });

  test('classifies supported SDK conversation stream event types', () => {
    for (const type of [
      'user_message',
      'turn_completed',
      'tool_call',
      'tool_output',
      'tool_bundle_call',
      'tool_bundle_output',
      'compaction_started',
      'compaction_applied',
      'compaction_skipped',
      'compaction_failed',
      'system_prompt',
      'user_message_metadata',
      'assistant_message',
      'tool_schemas_metadata',
      'turn_error',
      'usage_updated',
    ]) {
      expect(isSupportedConversationStreamEvent({ type })).toBe(true);
    }
    expect(isSupportedConversationStreamEvent({ type: 'unknown_event' })).toBe(false);
    expect(isSupportedConversationStreamEvent({ type: '' })).toBe(false);
    expect(isSupportedConversationStreamEvent({ type: null })).toBe(false);
    expect(isSupportedConversationStreamEvent(null)).toBe(false);
  });

  test('classifies tool display-only conversation stream events', () => {
    for (const type of [
      'tool_call',
      'tool_output',
      'tool_bundle_call',
      'tool_bundle_output',
    ]) {
      expect(isToolDisplayOnlyConversationStreamEvent({ type })).toBe(true);
    }
    expect(isToolDisplayOnlyConversationStreamEvent({ type: 'user_message' })).toBe(false);
    expect(isToolDisplayOnlyConversationStreamEvent({ type: 'turn_completed' })).toBe(false);
    expect(isToolDisplayOnlyConversationStreamEvent({ type: 'unknown_event' })).toBe(false);
    expect(isToolDisplayOnlyConversationStreamEvent(null)).toBe(false);
  });

  test('stale turn guard ignores packets from just-completed active turn during terminal pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      messages: [
        { id: 'assistant-old', sender: 'assistant', text: 'done', type: 'llm-text' as const },
      ],
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-old',
        phase: 'complete',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          messages: [
            { id: 'assistant-old', sender: 'assistant', text: 'done', type: 'llm-text' as const },
          ],
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'complete',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-old' }), null)).toBe(true);
  });

  test('stale turn guard keeps same-turn packets during terminal pending handoff when a new optimistic user row is present', () => {
    useChatStore.setState((state) => ({
      ...state,
      messages: [
        { id: 'user-new', sender: 'user', text: 'next turn', type: 'user' as const },
      ],
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-current',
        phase: 'complete',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          messages: [
            { id: 'user-new', sender: 'user', text: 'next turn', type: 'user' as const },
          ],
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-current',
            phase: 'complete',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-current' }), null)).toBe(false);
  });

  test('stale turn guard keeps same-turn packets during terminal pending handoff when an incomplete current-turn assistant placeholder is present', () => {
    useChatStore.setState((state) => ({
      ...state,
      messages: [
        {
          id: 'assistant-placeholder',
          sender: 'assistant',
          text: '',
          type: 'llm-text' as const,
          isComplete: false,
          turnRef: 'turn-current',
          sourceEventType: 'streaming-response',
        },
      ],
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-current',
        phase: 'complete',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          messages: [
            {
              id: 'assistant-placeholder',
              sender: 'assistant',
              text: '',
              type: 'llm-text' as const,
              isComplete: false,
              turnRef: 'turn-current',
              sourceEventType: 'streaming-response',
            },
          ],
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-current',
            phase: 'complete',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-current' }), null)).toBe(false);
  });

  test('stale turn guard allows next-turn packets during idle pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-old',
        phase: 'idle',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'idle',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-new' }), null)).toBe(false);
  });

  test('stale turn guard keeps same-turn packets during idle sending handoff after re-anchor', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-current',
        phase: 'idle',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-current',
            phase: 'idle',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-current' }), null)).toBe(false);
  });

  test('stale turn guard allows next-turn packets during error pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-old',
        phase: 'error',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'error',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-new' }), null)).toBe(false);
  });

  test('stale turn guard ignores same-turn packets during error pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      messages: [
        { id: 'assistant-old', sender: 'assistant', text: 'done', type: 'llm-text' as const },
      ],
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-old',
        phase: 'error',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          messages: [
            { id: 'assistant-old', sender: 'assistant', text: 'done', type: 'llm-text' as const },
          ],
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'error',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-old' }), null)).toBe(true);
  });

  test('stale turn guard keeps same-turn packets during error pending handoff when a new optimistic user row is present', () => {
    useChatStore.setState((state) => ({
      ...state,
      messages: [
        { id: 'user-new', sender: 'user', text: 'next turn', type: 'user' as const },
      ],
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-current',
        phase: 'error',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          messages: [
            { id: 'user-new', sender: 'user', text: 'next turn', type: 'user' as const },
          ],
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-current',
            phase: 'error',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-current' }), null)).toBe(false);
  });

  test('stale turn guard allows mismatched turn packets while sending during awaiting-first-chunk', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-old',
        phase: 'awaiting-first-chunk',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'awaiting-first-chunk',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-new' }), null)).toBe(false);
  });

  test('stale turn guard keeps packets when turn ref is absent', () => {
    expect(shouldIgnore(createEvent({ turnRef: undefined }), null)).toBe(false);
  });

  test('stale turn guard treats whitespace turn ref as absent', () => {
    expect(shouldIgnore(createEvent({ turnRef: '   ' }), null)).toBe(false);
  });

  test('stale turn guard compares normalized turn refs', () => {
    useChatStore.setState((state) => ({
      ...state,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-1',
        phase: 'streaming',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: false,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-1',
            phase: 'streaming',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: ' turn-1 ' }), null)).toBe(false);
  });

  test('stale turn guard allows next-turn packets when pending handoff has no active turn ref', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: null,
        phase: 'complete',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: null,
            phase: 'complete',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-new' }), null)).toBe(false);
  });

  test('stale turn guard ignores old-turn packets during active stream', () => {
    expect(shouldIgnore(createEvent({ turnRef: 'turn-old' }), null)).toBe(true);
  });

  test('stale turn guard is scoped to the provided conversation workspace', () => {
    useChatStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: false,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-default',
            phase: 'streaming',
          },
        },
        'conv-scoped': {
          ...state.workspaces.__default__,
          isSending: false,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-conv',
            phase: 'streaming',
          },
        },
      },
    }));

    expect(
      shouldIgnore(createEvent({ turnRef: 'turn-default' }), 'conv-scoped'),
    ).toBe(true);
  });

  test('terminal handoff allowance does not leak across workspaces', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-default-old',
        phase: 'complete',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-default-old',
            phase: 'complete',
          },
        },
        'conv-scoped': {
          ...state.workspaces.__default__,
          isSending: false,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-conv-old',
            phase: 'streaming',
          },
        },
      },
    }));

    expect(
      shouldIgnore(createEvent({ turnRef: 'turn-conv-new' }), 'conv-scoped'),
    ).toBe(true);
  });

  test('recordTrackingEvent delegates updater with applied event metadata', () => {
    const mockUpdate = jest.fn();
    recordTrackingEvent(
      mockUpdate as any,
      'streaming-response',
      'turn-1',
      { phase: 'streaming', chunkSize: 42 },
      'conv-1',
    );

    expect(mockUpdate).toHaveBeenCalledWith(expect.any(Function), 'conv-1');
    const updater = mockUpdate.mock.calls[0][0];
    const next = updater({
      activeTurnRef: null,
      phase: 'idle',
      startedAt: null,
      firstChunkAt: null,
      completedAt: null,
      lastEventAt: null,
      lastEventType: null,
      eventCount: 0,
      chunkCount: 0,
      toolCallCount: 0,
      toolOutputCount: 0,
      lastChunkSize: 0,
      lastError: null,
    });
    expect(next.activeTurnRef).toBe('turn-1');
    expect(next.phase).toBe('streaming');
    expect(next.chunkCount).toBe(1);
    expect(next.lastChunkSize).toBe(42);
  });
});
