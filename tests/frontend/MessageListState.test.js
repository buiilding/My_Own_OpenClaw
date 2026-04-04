import {
  resolveCompactionStatusText,
  shouldRenderAssistantActions,
  shouldRenderUserActions,
} from '../../frontend/src/renderer/features/chat/utils/message/messageListState';
import { resolveCurrentTurnPresentationState } from '../../frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState';
import { OVERLAY_TURN_LIFECYCLE } from '../../frontend/src/renderer/features/chat/utils/overlay/overlayTurnLifecycleContract';

describe('messageListState', () => {
  test('awaiting-dot target picks latest user row only while awaiting reply', () => {
    const awaitingState = resolveCurrentTurnPresentationState({
      phase: 'idle',
      lifecycle: OVERLAY_TURN_LIFECYCLE.PREFLIGHT,
      messages: [
        { id: 'assistant-1', sender: 'assistant' },
        { id: 'user-1', sender: 'user' },
        { id: 'assistant-2', sender: 'assistant' },
        { id: 'user-2', sender: 'user' },
      ],
    });
    expect(awaitingState.awaitingDotTargetMessageId).toBe('user-2');

    const notAwaitingState = resolveCurrentTurnPresentationState({
      phase: 'complete',
      lifecycle: OVERLAY_TURN_LIFECYCLE.TERMINAL,
      messages: [{ id: 'user-1', sender: 'user' }],
    });
    expect(notAwaitingState.awaitingDotTargetMessageId).toBeNull();
  });

  test('resolveCompactionStatusText maps source event to status metadata', () => {
    expect(resolveCompactionStatusText('Compacting...', 'context-compaction-started')).toEqual(
      expect.objectContaining({ state: 'in-progress' }),
    );
    expect(resolveCompactionStatusText('Done', 'context-compaction-completed')).toEqual(
      expect.objectContaining({ state: 'completed' }),
    );
    expect(resolveCompactionStatusText('Failed', 'context-compaction-failed')).toEqual(
      expect.objectContaining({ state: 'failed' }),
    );
    expect(resolveCompactionStatusText('', 'context-compaction-failed')).toBeNull();
    expect(resolveCompactionStatusText('x', 'llm-thought')).toBeNull();
  });

  test('assistant/user action gating matches message type and role', () => {
    expect(shouldRenderAssistantActions({ sender: 'assistant', type: 'llm-text' }, true)).toBe(true);
    expect(shouldRenderAssistantActions({ sender: 'assistant', type: 'tool-call' }, true)).toBe(false);
    expect(shouldRenderAssistantActions({ sender: 'user', type: 'llm-text' }, true)).toBe(false);
    expect(shouldRenderUserActions({ sender: 'user' }, true)).toBe(true);
    expect(shouldRenderUserActions({ sender: 'assistant' }, true)).toBe(false);
    expect(shouldRenderUserActions({ sender: 'user' }, false)).toBe(false);
  });
});
