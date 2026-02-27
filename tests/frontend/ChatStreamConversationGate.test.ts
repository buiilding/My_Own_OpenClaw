import {
  resolveEventConversationRef,
  shouldIgnoreEventForActiveConversation,
} from '../../frontend/src/renderer/features/chat/utils/chatStreamConversationGate';
import type { BackendEvent } from '../../frontend/src/renderer/types/backendEvents';

function buildEvent(overrides: Partial<BackendEvent>): BackendEvent {
  return {
    type: 'token-count',
    payload: undefined,
    ...overrides,
  } as BackendEvent;
}

describe('chatStreamConversationGate', () => {
  test('resolveEventConversationRef uses top-level conversation_ref first', () => {
    const event = buildEvent({ conversation_ref: 'conv-1' });
    expect(resolveEventConversationRef(event)).toBe('conv-1');
  });

  test('resolveEventConversationRef falls back to local-user-message payload', () => {
    const event = buildEvent({
      type: 'local-user-message',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-2',
      },
    });
    expect(resolveEventConversationRef(event)).toBe('conv-2');
  });

  test('ignores stale non-local events only when stream turn is active', () => {
    const event = buildEvent({
      type: 'streaming-response',
      conversation_ref: 'conv-stale',
      payload: { text: 'x' },
    });

    expect(
      shouldIgnoreEventForActiveConversation(
        event,
        'conv-active',
        { activeTurnRef: 'turn-1', phase: 'streaming' },
      ),
    ).toBe(true);

    expect(
      shouldIgnoreEventForActiveConversation(
        event,
        'conv-active',
        { activeTurnRef: null, phase: 'streaming' },
      ),
    ).toBe(false);

    expect(
      shouldIgnoreEventForActiveConversation(
        event,
        'conv-active',
        { activeTurnRef: 'turn-1', phase: 'complete' },
      ),
    ).toBe(false);
  });

  test('never ignores local-user-message mismatch events', () => {
    const event = buildEvent({
      type: 'local-user-message',
      conversation_ref: 'conv-stale',
      payload: { text: 'user' },
    });

    expect(
      shouldIgnoreEventForActiveConversation(
        event,
        'conv-active',
        { activeTurnRef: 'turn-1', phase: 'streaming' },
      ),
    ).toBe(false);
  });

  test('never ignores context-compaction lifecycle events despite conversation mismatch', () => {
    const started = buildEvent({
      type: 'context-compaction-started',
      conversation_ref: 'conv-stale',
      payload: { reason: 'manual' },
    });
    const completed = buildEvent({
      type: 'context-compaction-completed',
      conversation_ref: 'conv-stale',
      payload: { reason: 'manual' },
    });
    const failed = buildEvent({
      type: 'context-compaction-failed',
      conversation_ref: 'conv-stale',
      payload: { reason: 'manual', error: 'boom' },
    });

    const streamTracking = { activeTurnRef: 'turn-1', phase: 'streaming' as const };
    expect(shouldIgnoreEventForActiveConversation(started, 'conv-active', streamTracking)).toBe(false);
    expect(shouldIgnoreEventForActiveConversation(completed, 'conv-active', streamTracking)).toBe(false);
    expect(shouldIgnoreEventForActiveConversation(failed, 'conv-active', streamTracking)).toBe(false);
  });
});
