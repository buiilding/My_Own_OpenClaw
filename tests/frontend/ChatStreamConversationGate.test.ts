import {
  resolveEventConversationRef,
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

  test('resolveEventConversationRef falls back to memory-store session ids', () => {
    const event = buildEvent({
      type: 'memory-store',
      payload: {
        session_id: 'conv-memory',
      },
    });
    expect(resolveEventConversationRef(event)).toBe('conv-memory');
  });
});
