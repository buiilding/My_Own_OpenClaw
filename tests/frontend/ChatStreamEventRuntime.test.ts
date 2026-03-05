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

  test('stale turn guard ignores old-turn packets during active stream', () => {
    expect(shouldIgnoreForStaleTurn(createEvent({ turn_ref: 'turn-old' }), null)).toBe(true);
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
