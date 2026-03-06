import {
  resolveConversationRefWithTurnFallback,
  resolveEventConversationRef,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate';
import type { BackendEvent } from '../../frontend/src/renderer/types/backendEvents';

function buildEvent(overrides: Partial<BackendEvent>): BackendEvent {
  return {
    type: 'token-count',
    payload: undefined,
    ...overrides,
  } as BackendEvent;
}

describe('chatStreamConversationGate', () => {
  test('resolveConversationRefWithTurnFallback prefers explicit conversation ref', () => {
    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: ' conv-explicit ',
      turnRef: 'turn-1',
      resolveConversationRefForTurn: () => 'conv-turn',
      fallbackConversationRef: 'conv-active',
    })).toBe('conv-explicit');
  });

  test('resolveConversationRefWithTurnFallback falls back by turn then active ref', () => {
    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: null,
      turnRef: 'turn-2',
      resolveConversationRefForTurn: (turnRef) => turnRef === 'turn-2' ? 'conv-turn' : null,
      fallbackConversationRef: 'conv-active',
    })).toBe('conv-turn');

    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: '',
      turnRef: 'turn-missing',
      resolveConversationRefForTurn: () => null,
      fallbackConversationRef: ' conv-active ',
    })).toBe('conv-active');
  });

  test('resolveConversationRefWithTurnFallback ignores blank turn mapping and falls back to active ref', () => {
    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: null,
      turnRef: 'turn-blank-mapped',
      resolveConversationRefForTurn: () => '   ',
      fallbackConversationRef: 'conv-active',
    })).toBe('conv-active');
  });

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

  test('resolveEventConversationRef falls back to memory-store session ids', () => {
    const event = buildEvent({
      type: 'memory-store',
      payload: {
        session_id: 'conv-memory',
      },
    });
    expect(resolveEventConversationRef(event)).toBe('conv-memory');
  });

  test('resolveEventConversationRef falls back to memory-store event.session_id when payload session is missing', () => {
    const event = buildEvent({
      type: 'memory-store',
      payload: {},
      session_id: 'conv-memory-event',
    });
    expect(resolveEventConversationRef(event)).toBe('conv-memory-event');
  });

  test('resolveEventConversationRef ignores whitespace memory-store payload session and falls back to event.session_id', () => {
    const event = buildEvent({
      type: 'memory-store',
      payload: {
        session_id: '   ',
      },
      session_id: 'conv-memory-event',
    });
    expect(resolveEventConversationRef(event)).toBe('conv-memory-event');
  });

  test('resolveEventConversationRef returns null for local-user-message without payload conversation ref', () => {
    const event = buildEvent({
      type: 'local-user-message',
      payload: {
        text: 'hello',
      },
    });
    expect(resolveEventConversationRef(event)).toBeNull();
  });

  test('resolveEventConversationRef returns null for non-local events without explicit ref', () => {
    const event = buildEvent({
      type: 'streaming-response',
      payload: {
        content: 'chunk',
      } as any,
    });
    expect(resolveEventConversationRef(event)).toBeNull();
  });

  test('resolveEventConversationRef ignores whitespace local-user payload conversation ref', () => {
    const event = buildEvent({
      type: 'local-user-message',
      payload: {
        text: 'hello',
        conversation_ref: '   ',
      },
    });
    expect(resolveEventConversationRef(event)).toBeNull();
  });
});
