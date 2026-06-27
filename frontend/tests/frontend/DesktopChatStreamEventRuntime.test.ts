/**
 * Covers desktop chat stream event runtime. behavior in the frontend test suite.
 */

import { useChatStore } from '../../src/renderer/features/chat/stores/chatStore';
import { DesktopChatStreamEventRuntime } from '../../src/renderer/app/runtime/desktopChatStreamEventRuntime';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../src/renderer/app/runtime/desktopChatTurnConversationRefRuntime';

const {
  isAssistantMessageConversationStreamEvent,
  isCompactionCompletedConversationStreamEvent,
  isCompactionFailedConversationStreamEvent,
  isCompactionSkippedConversationStreamEvent,
  isCompactionStartedConversationStreamEvent,
  isLocalUserMessageConversationStreamEvent,
  isSupportedConversationStreamEvent,
  isSystemPromptConversationStreamEvent,
  isToolDisplayOnlyConversationStreamEvent,
  isToolSchemasMetadataConversationStreamEvent,
  isTurnCompletedConversationStreamEvent,
  isTurnErrorConversationStreamEvent,
  isUserMessageMetadataConversationStreamEvent,
  isUsageUpdatedConversationStreamEvent,
  recordTrackingEvent,
  resolveConversationStreamEventIdentity,
  resolveTurnCompletedStreamEventState,
  resolveWorkspaceThinkingSourceEventType,
  shouldIgnoreConversationEventIdentityForStaleTurn,
  shouldRecordTerminalCompletionTracking,
} = DesktopChatStreamEventRuntime;
const {
  resetRendererTurnConversationRefs,
} = DesktopChatTurnConversationRefRuntime;

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'streaming-response',
    payload: {},
    user_id: 'default_user',
    ...overrides,
  } as any;
}

function pendingTurn(turnRef = 'turn-new', conversationRef = 'conv-default') {
  return {
    conversationRef,
    turnRef,
    userMessageId: `user-${turnRef}`,
    text: 'next turn',
    timestamp: '2026-06-21T12:00:00.000Z',
    attachmentFilenames: null,
  };
}

function getWorkspaceState(conversationRef?: string | null) {
  return useChatStore.getState().getWorkspaceState(conversationRef);
}

function shouldIgnore(event: ReturnType<typeof createEvent>, conversationRef?: string | null): boolean {
  return shouldIgnoreConversationEventIdentityForStaleTurn(
    resolveConversationStreamEventIdentity(event, conversationRef),
    conversationRef,
    { getWorkspaceState },
  );
}

describe('DesktopChatStreamEventRuntime', () => {
  beforeEach(() => {
    resetRendererTurnConversationRefs();
    useChatStore.setState((state) => ({
      ...state,
      activeConversationRef: null,
      isSending: false,
      pendingTurn: null,
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
          pendingTurn: null,
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
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
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

  test('stale raw sending state alone does not open terminal pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      pendingTurn: null,
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
          pendingTurn: null,
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'complete',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-new' }), null)).toBe(true);
  });

  test('terminal pending handoff only keeps packets for the renderer pending turn', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-old',
            phase: 'complete',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-new' }), null)).toBe(false);
    expect(shouldIgnore(createEvent({ turnRef: 'turn-unrelated' }), null)).toBe(true);
  });

  test('terminal completion tracking ignores duplicate complete with only stale raw sending', () => {
    expect(shouldRecordTerminalCompletionTracking({
      messages: [],
      pendingTurn: null,
      streamTracking: {
        activeTurnRef: 'turn-old',
        phase: 'complete',
      },
      isSending: true,
      thinkingStatus: null,
      thinkingSourceEventType: null,
    } as any, 'turn-old')).toBe(false);
  });

  test('terminal completion tracking records matching pending turn only', () => {
    expect(shouldRecordTerminalCompletionTracking({
      messages: [],
      pendingTurn: pendingTurn('turn-new'),
      streamTracking: {
        activeTurnRef: 'turn-old',
        phase: 'complete',
      },
      thinkingStatus: null,
      thinkingSourceEventType: null,
    }, 'turn-new')).toBe(true);

    expect(shouldRecordTerminalCompletionTracking({
      messages: [],
      pendingTurn: pendingTurn('turn-new'),
      streamTracking: {
        activeTurnRef: 'turn-old',
        phase: 'complete',
      },
      thinkingStatus: null,
      thinkingSourceEventType: null,
    }, 'turn-unrelated')).toBe(false);

    expect(shouldRecordTerminalCompletionTracking({
      messages: [],
      pendingTurn: null,
      streamTracking: {
        activeTurnRef: 'turn-old',
        phase: 'complete',
      },
      thinkingStatus: 'thinking',
      thinkingSourceEventType: null,
    } as any, 'turn-old')).toBe(false);
  });

  test('terminal completion tracking records matching ConversationView live turn over stale complete stream state', () => {
    expect(shouldRecordTerminalCompletionTracking({
      messages: [],
      pendingTurn: null,
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: ' turn-view ',
          phase: 'streaming',
        },
        displayRows: [],
      },
      streamTracking: {
        activeTurnRef: 'turn-stale',
        phase: 'complete',
      },
      thinkingStatus: null,
      thinkingSourceEventType: null,
    } as any, 'turn-view')).toBe(true);

    expect(shouldRecordTerminalCompletionTracking({
      messages: [],
      pendingTurn: null,
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          phase: 'streaming',
        },
        displayRows: [],
      },
      streamTracking: {
        activeTurnRef: 'turn-stale',
        phase: 'complete',
      },
      thinkingStatus: null,
      thinkingSourceEventType: null,
    } as any, 'turn-stale')).toBe(false);
  });

  test('terminal completion tracking records non-complete stream phase', () => {
    expect(shouldRecordTerminalCompletionTracking({
      messages: [],
      pendingTurn: null,
      streamTracking: {
        activeTurnRef: 'turn-old',
      phase: 'streaming',
      },
    }, 'turn-old')).toBe(true);
  });

  test('resolves terminal completion state through runtime workspace dependency', () => {
    const workspace = {
      messages: [],
      pendingTurn: pendingTurn('turn-new', 'conv-complete'),
      streamTracking: {
        activeTurnRef: 'turn-old',
        phase: 'complete',
      },
    };

    expect(resolveTurnCompletedStreamEventState(
      {
        type: 'turn_completed',
        conversationRef: 'conv-complete',
        turnRef: 'turn-new',
      },
      null,
      {
        getWorkspaceState: jest.fn(() => workspace),
      },
    )).toEqual({
      conversationRef: 'conv-complete',
      shouldRecordTerminalTracking: true,
      turnRef: 'turn-new',
    });
  });

  test('ignores non-completion events in terminal completion state resolver', () => {
    expect(resolveTurnCompletedStreamEventState(
      {
        type: 'assistant_message',
        conversationRef: 'conv-complete',
        turnRef: 'turn-new',
      },
      null,
      {
        getWorkspaceState: jest.fn(() => {
          throw new Error('workspace should not be read');
        }),
      },
    )).toBeNull();
  });

  test('resolves workspace thinking source event type through runtime dependency', () => {
    const getWorkspaceState = jest.fn(() => ({
      thinkingSourceEventType: ' context-compaction-started ',
    }));

    expect(resolveWorkspaceThinkingSourceEventType('conv-thinking', {
      getWorkspaceState,
    })).toBe('context-compaction-started');
    expect(getWorkspaceState).toHaveBeenCalledWith('conv-thinking');
  });

  test('normalizes missing workspace thinking source event type to null', () => {
    expect(resolveWorkspaceThinkingSourceEventType('conv-thinking', {
      getWorkspaceState: jest.fn(() => null),
    })).toBeNull();
    expect(resolveWorkspaceThinkingSourceEventType('conv-thinking', {
      getWorkspaceState: jest.fn(() => ({
        thinkingSourceEventType: '   ',
      })),
    })).toBeNull();
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

  test('classifies compaction conversation stream events', () => {
    expect(isCompactionStartedConversationStreamEvent({ type: 'compaction_started' })).toBe(true);
    expect(isCompactionStartedConversationStreamEvent({ type: 'compaction_applied' })).toBe(false);
    expect(isCompactionStartedConversationStreamEvent(null)).toBe(false);

    expect(isCompactionCompletedConversationStreamEvent({ type: 'compaction_applied' })).toBe(true);
    expect(isCompactionCompletedConversationStreamEvent({ type: 'compaction_skipped' })).toBe(true);
    expect(isCompactionCompletedConversationStreamEvent({ type: 'compaction_failed' })).toBe(false);
    expect(isCompactionCompletedConversationStreamEvent(null)).toBe(false);

    expect(isCompactionSkippedConversationStreamEvent({ type: 'compaction_skipped' })).toBe(true);
    expect(isCompactionSkippedConversationStreamEvent({ type: 'compaction_applied' })).toBe(false);
    expect(isCompactionSkippedConversationStreamEvent(null)).toBe(false);

    expect(isCompactionFailedConversationStreamEvent({ type: 'compaction_failed' })).toBe(true);
    expect(isCompactionFailedConversationStreamEvent({ type: 'compaction_started' })).toBe(false);
    expect(isCompactionFailedConversationStreamEvent(null)).toBe(false);
  });

  test('classifies metadata conversation stream events', () => {
    expect(isSystemPromptConversationStreamEvent({ type: 'system_prompt' })).toBe(true);
    expect(isSystemPromptConversationStreamEvent({ type: 'assistant_message' })).toBe(false);
    expect(isSystemPromptConversationStreamEvent(null)).toBe(false);

    expect(isUserMessageMetadataConversationStreamEvent({ type: 'user_message_metadata' })).toBe(true);
    expect(isUserMessageMetadataConversationStreamEvent({ type: 'system_prompt' })).toBe(false);
    expect(isUserMessageMetadataConversationStreamEvent(null)).toBe(false);

    expect(isAssistantMessageConversationStreamEvent({ type: 'assistant_message' })).toBe(true);
    expect(isAssistantMessageConversationStreamEvent({ type: 'user_message_metadata' })).toBe(false);
    expect(isAssistantMessageConversationStreamEvent(null)).toBe(false);

    expect(isToolSchemasMetadataConversationStreamEvent({ type: 'tool_schemas_metadata' })).toBe(true);
    expect(isToolSchemasMetadataConversationStreamEvent({ type: 'assistant_message' })).toBe(false);
    expect(isToolSchemasMetadataConversationStreamEvent(null)).toBe(false);
  });

  test('classifies local user and terminal conversation stream events', () => {
    expect(isLocalUserMessageConversationStreamEvent({ type: 'user_message' })).toBe(true);
    expect(isLocalUserMessageConversationStreamEvent({ type: 'turn_error' })).toBe(false);
    expect(isLocalUserMessageConversationStreamEvent(null)).toBe(false);

    expect(isTurnCompletedConversationStreamEvent({ type: 'turn_completed' })).toBe(true);
    expect(isTurnCompletedConversationStreamEvent({ type: 'usage_updated' })).toBe(false);
    expect(isTurnCompletedConversationStreamEvent(null)).toBe(false);

    expect(isTurnErrorConversationStreamEvent({ type: 'turn_error' })).toBe(true);
    expect(isTurnErrorConversationStreamEvent({ type: 'usage_updated' })).toBe(false);
    expect(isTurnErrorConversationStreamEvent(null)).toBe(false);

    expect(isUsageUpdatedConversationStreamEvent({ type: 'usage_updated' })).toBe(true);
    expect(isUsageUpdatedConversationStreamEvent({ type: 'turn_error' })).toBe(false);
    expect(isUsageUpdatedConversationStreamEvent(null)).toBe(false);
  });

  test('normalizes SDK conversation stream event identity fields', () => {
    expect(resolveConversationStreamEventIdentity({
      conversationRef: ' conversation-1 ',
      turnRef: ' turn-1 ',
    })).toEqual({
      conversationRef: 'conversation-1',
      turnRef: 'turn-1',
      turnRefForUpdate: 'turn-1',
    });
    expect(resolveConversationStreamEventIdentity({
      turnRef: ' turn-1 ',
    })).toEqual({
      conversationRef: null,
      turnRef: 'turn-1',
      turnRefForUpdate: 'turn-1',
    });
    expect(resolveConversationStreamEventIdentity({
      conversationRef: ' conversation-1 ',
      turnRef: ' turn-1 ',
    }, ' fallback-conversation ')).toEqual({
      conversationRef: 'fallback-conversation',
      turnRef: 'turn-1',
      turnRefForUpdate: 'turn-1',
    });

    expect(resolveConversationStreamEventIdentity({
      conversationRef: '   ',
      turnRef: '   ',
    })).toEqual({
      conversationRef: null,
      turnRef: null,
      turnRefForUpdate: undefined,
    });
    expect(resolveConversationStreamEventIdentity(null)).toEqual({
      conversationRef: null,
      turnRef: null,
      turnRefForUpdate: undefined,
    });
  });

  test('stale turn guard ignores packets from just-completed active turn during terminal pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      messages: [
        { id: 'assistant-old', sender: 'assistant', text: 'done', type: 'llm-text' as const },
      ],
      isSending: true,
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
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
      pendingTurn: pendingTurn('turn-current'),
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
          pendingTurn: pendingTurn('turn-current'),
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
      pendingTurn: pendingTurn('turn-current'),
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
          pendingTurn: pendingTurn('turn-current'),
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
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
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
      pendingTurn: pendingTurn('turn-current'),
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
          pendingTurn: pendingTurn('turn-current'),
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
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
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

  test('stale turn guard ignores old active-turn packets during error pending handoff', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
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

  test('stale turn guard keeps same-turn packets during error pending handoff when the pending bridge owns them', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      pendingTurn: pendingTurn('turn-current'),
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-current',
        phase: 'error',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          isSending: true,
          pendingTurn: pendingTurn('turn-current'),
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
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
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

  test('stale turn guard prefers ConversationView live turn over stale stream tracking', () => {
    useChatStore.setState((state) => ({
      ...state,
      streamTracking: {
        ...state.streamTracking,
        activeTurnRef: 'turn-stale',
        phase: 'streaming',
      },
      workspaces: {
        ...state.workspaces,
        __default__: {
          ...state.workspaces.__default__,
          conversationView: {
            conversationRef: 'conv-view',
            displayRows: [],
            liveTurn: {
              turnRef: ' turn-view ',
              phase: 'streaming',
              entries: [],
              canStop: true,
            },
          },
          streamTracking: {
            ...state.workspaces.__default__.streamTracking,
            activeTurnRef: 'turn-stale',
            phase: 'streaming',
          },
        },
      },
    }));

    expect(shouldIgnore(createEvent({ turnRef: 'turn-view' }), null)).toBe(false);
    expect(shouldIgnore(createEvent({ turnRef: 'turn-stale' }), null)).toBe(true);
  });

  test('stale turn guard allows next-turn packets when pending handoff has no active turn ref', () => {
    useChatStore.setState((state) => ({
      ...state,
      isSending: true,
      pendingTurn: pendingTurn('turn-new'),
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
          pendingTurn: pendingTurn('turn-new'),
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
      pendingTurn: pendingTurn('turn-default-new'),
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
          pendingTurn: pendingTurn('turn-default-new'),
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
