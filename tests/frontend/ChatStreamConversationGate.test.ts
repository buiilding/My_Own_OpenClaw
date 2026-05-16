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
    })).toBe('conv-explicit');
  });

  test('resolveConversationRefWithTurnFallback falls back by turn mapping only', () => {
    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: null,
      turnRef: 'turn-2',
      resolveConversationRefForTurn: (turnRef) => turnRef === 'turn-2' ? 'conv-turn' : null,
    })).toBe('conv-turn');

    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: '',
      turnRef: 'turn-missing',
      resolveConversationRefForTurn: () => null,
    })).toBeNull();
  });

  test('resolveConversationRefWithTurnFallback ignores blank turn mapping', () => {
    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: null,
      turnRef: 'turn-blank-mapped',
      resolveConversationRefForTurn: () => '   ',
    })).toBeNull();
  });

  test('resolveConversationRefWithTurnFallback trims turn ref for lookup and trims mapped conversation ref result', () => {
    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: null,
      turnRef: ' turn-2 ',
      resolveConversationRefForTurn: (turnRef) => turnRef === 'turn-2' ? ' conv-turn-trimmed ' : null,
    })).toBe('conv-turn-trimmed');
  });

  test('resolveConversationRefWithTurnFallback returns null when no explicit or turn-mapped ref is available', () => {
    expect(resolveConversationRefWithTurnFallback({
      explicitConversationRef: null,
      turnRef: '',
      resolveConversationRefForTurn: () => null,
    })).toBeNull();
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

  test('resolveEventConversationRef ignores memory-store session ids', () => {
    const event = buildEvent({
      type: 'memory-store',
      payload: {
        session_id: 'conv-memory',
      },
    });
    expect(resolveEventConversationRef(event)).toBeNull();
  });

  test('resolveEventConversationRef ignores memory-store event session_id', () => {
    const event = buildEvent({
      type: 'memory-store',
      payload: {},
      session_id: 'conv-memory-event',
    });
    expect(resolveEventConversationRef(event)).toBeNull();
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

  test('resolveEventConversationRef falls through whitespace top-level conversation_ref to local-user payload fallback', () => {
    const event = buildEvent({
      type: 'local-user-message',
      conversation_ref: '   ',
      payload: {
        text: 'hello',
        conversation_ref: 'conv-local-from-payload',
      },
    });
    expect(resolveEventConversationRef(event)).toBe('conv-local-from-payload');
  });

  test('resolveEventConversationRef ignores memory-store session fallback after whitespace top-level conversation_ref', () => {
    const event = buildEvent({
      type: 'memory-store',
      conversation_ref: '   ',
      payload: {
        session_id: 'conv-memory-from-payload',
      },
    });
    expect(resolveEventConversationRef(event)).toBeNull();
  });
});
