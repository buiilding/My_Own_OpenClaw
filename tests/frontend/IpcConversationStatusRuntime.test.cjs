/** @jest-environment node */

const {
  buildConversationTerminalStatus,
  resolveConversationStatusError,
} = require('../../frontend/src/main/ipc/ipc_conversation_status_runtime.cjs');

describe('ipc_conversation_status_runtime', () => {
  test('projects completed and stopped events into desktop statuses', () => {
    expect(buildConversationTerminalStatus({
      type: 'turn_completed',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    }, 'C:/work')).toEqual({
      phase: 'ready',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      workspacePath: 'C:/work',
    });

    expect(buildConversationTerminalStatus({
      type: 'turn_stopped',
      conversationRef: 'conv-2',
      turnRef: 'turn-2',
    }, null)).toEqual({
      phase: 'stopped',
      conversationRef: 'conv-2',
      turnRef: 'turn-2',
      workspacePath: null,
    });
  });

  test('projects error event payloads without leaking invalid values', () => {
    expect(resolveConversationStatusError({
      payload: { error: 'runtime failed' },
    })).toBe('runtime failed');
    expect(resolveConversationStatusError({
      payload: { error: 42 },
    })).toBeNull();

    expect(buildConversationTerminalStatus({
      type: 'runtime_error',
      conversationRef: 'conv-error',
      turnRef: 'turn-error',
      payload: { error: 'runtime failed' },
    }, 'C:/work')).toEqual({
      phase: 'error',
      conversationRef: 'conv-error',
      turnRef: 'turn-error',
      workspacePath: 'C:/work',
      error: 'runtime failed',
    });
  });

  test('ignores non-terminal events', () => {
    expect(buildConversationTerminalStatus({
      type: 'text_delta',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    }, 'C:/work')).toBeNull();
  });
});
