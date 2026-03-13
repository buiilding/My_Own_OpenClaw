import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  recordTrackingEvent,
  resolveTargetConversationRef,
  shouldIgnoreForStaleTurn,
  syncActiveConversationProjection,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventRuntime';

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'streaming-response',
    payload: {},
    user_id: 'default_user',
    ...overrides,
  } as any;
}

describe('chatStreamEventRuntime', () => {
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

  test('resolves conversation ref from explicit event field', () => {
    const ref = resolveTargetConversationRef(
      createEvent({ conversation_ref: 'conv-explicit' }),
    );
    expect(ref).toBe('conv-explicit');
  });

  test('resolves conversation ref from registered turn mapping fallback', () => {
    useChatStore.getState().registerTurnConversationRef('turn-mapped', 'conv-mapped');
    const ref = resolveTargetConversationRef(
      createEvent({ turn_ref: 'turn-mapped' }),
    );
    expect(ref).toBe('conv-mapped');
  });

  test('resolves conversation ref from memory-store payload session id fallback', () => {
    const ref = resolveTargetConversationRef(
      createEvent({
        type: 'memory-store',
        payload: { session_id: 'conv-memory-payload' },
      }),
    );

    expect(ref).toBe('conv-memory-payload');
  });

  test('resolves conversation ref from memory-store event session id when payload session missing', () => {
    const ref = resolveTargetConversationRef(
      createEvent({
        type: 'memory-store',
        payload: {},
        session_id: 'conv-memory-event',
      }),
    );

    expect(ref).toBe('conv-memory-event');
  });

  test('resolves conversation ref from memory-store event session id when payload session id is whitespace', () => {
    const ref = resolveTargetConversationRef(
      createEvent({
        type: 'memory-store',
        payload: { session_id: '   ' },
        session_id: 'conv-memory-event',
      }),
    );

    expect(ref).toBe('conv-memory-event');
  });

  test('resolves conversation ref from local-user-message payload fallback', () => {
    const ref = resolveTargetConversationRef(
      createEvent({
        type: 'local-user-message',
        payload: { text: 'hello', conversation_ref: 'conv-local-payload' },
      }),
    );

    expect(ref).toBe('conv-local-payload');
  });

  test('resolves conversation ref from local-user payload when top-level conversation ref is whitespace', () => {
    const ref = resolveTargetConversationRef(
      createEvent({
        type: 'local-user-message',
        conversation_ref: '   ',
        payload: { text: 'hello', conversation_ref: 'conv-local-payload' },
      }),
    );

    expect(ref).toBe('conv-local-payload');
  });

  test('resolveTargetConversationRef keeps explicit conversation ref precedence over compatibility fallbacks', () => {
    const ref = resolveTargetConversationRef(
      createEvent({
        type: 'memory-store',
        conversation_ref: 'conv-explicit',
        payload: { session_id: 'conv-memory-payload' },
        session_id: 'conv-memory-event',
      }),
    );

    expect(ref).toBe('conv-explicit');
  });

  test('resolveTargetConversationRef uses provided fallback conversation ref when no explicit or mapped identity exists', () => {
    const ref = resolveTargetConversationRef(
      createEvent({
        type: 'streaming-response',
        payload: { content: 'chunk' },
      }),
      'conv-fallback-active',
    );

    expect(ref).toBe('conv-fallback-active');
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-new' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-old' }), null)).toBe(true);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-current' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-current' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-new' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-current' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-new' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-old' }), null)).toBe(true);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-current' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-new' }), null)).toBe(false);
  });

  test('stale turn guard keeps packets when turn ref is absent', () => {
    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: undefined }), null)).toBe(false);
  });

  test('stale turn guard treats whitespace turn ref as absent', () => {
    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: '   ' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: ' turn-1 ' }), null)).toBe(false);
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

    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-new' }), null)).toBe(false);
  });

  test('stale turn guard ignores old-turn packets during active stream', () => {
    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-old' }), null)).toBe(true);
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
      shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-default' }), 'conv-scoped'),
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
      shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-conv-new' }), 'conv-scoped'),
    ).toBe(true);
  });

  test('active conversation projection is a no-op when resolved conversation ref is missing', () => {
    const setActiveConversationRef = jest.fn();

    syncActiveConversationProjection(
      createEvent({ conversation_ref: 'conv-explicit' }),
      null,
      setActiveConversationRef,
    );

    expect(setActiveConversationRef).not.toHaveBeenCalled();
  });

  test('active conversation projection is a no-op when event has no explicit conversation identity', () => {
    const setActiveConversationRef = jest.fn();
    useChatStore.setState((state) => ({
      ...state,
      activeConversationRef: null,
    }));

    syncActiveConversationProjection(
      createEvent({ turn_ref: 'turn-mapped-no-explicit' }),
      'conv-mapped',
      setActiveConversationRef,
    );

    expect(setActiveConversationRef).not.toHaveBeenCalled();
  });

  test('active conversation projection is a no-op when active conversation already matches', () => {
    const setActiveConversationRef = jest.fn();
    useChatStore.setState((state) => ({
      ...state,
      activeConversationRef: 'conv-current',
    }));

    syncActiveConversationProjection(
      createEvent({ conversation_ref: 'conv-current' }),
      'conv-current',
      setActiveConversationRef,
    );

    expect(setActiveConversationRef).not.toHaveBeenCalled();
  });

  test('active conversation projection promotes explicit ref when active conversation is empty', () => {
    const setActiveConversationRef = jest.fn();
    useChatStore.setState((state) => ({
      ...state,
      activeConversationRef: null,
    }));

    syncActiveConversationProjection(
      createEvent({ conversation_ref: 'conv-next' }),
      'conv-next',
      setActiveConversationRef,
    );

    expect(setActiveConversationRef).toHaveBeenCalledWith('conv-next');
  });

  test('active conversation projection does not let non-local stream events replace an active chat', () => {
    const setActiveConversationRef = jest.fn();
    useChatStore.setState((state) => ({
      ...state,
      activeConversationRef: 'conv-current',
    }));

    syncActiveConversationProjection(
      createEvent({ conversation_ref: 'conv-next' }),
      'conv-next',
      setActiveConversationRef,
    );

    expect(setActiveConversationRef).not.toHaveBeenCalled();
  });

  test('active conversation projection promotes explicit ref on local-user-message', () => {
    const setActiveConversationRef = jest.fn();
    useChatStore.setState((state) => ({
      ...state,
      activeConversationRef: 'conv-current',
    }));

    syncActiveConversationProjection(
      createEvent({
        type: 'local-user-message',
        conversation_ref: 'conv-next',
      }),
      'conv-next',
      setActiveConversationRef,
    );

    expect(setActiveConversationRef).toHaveBeenCalledWith('conv-next');
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
