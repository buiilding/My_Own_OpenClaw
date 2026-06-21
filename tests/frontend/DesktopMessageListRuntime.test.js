/**
 * Covers desktop message list runtime behavior in the frontend test suite.
 */

import { DesktopMessageListRuntime } from '../../frontend/src/renderer/app/runtime/desktopMessageListRuntime';
import { DesktopCurrentTurnPresentationRuntime } from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime';

describe('desktopMessageListRuntime', () => {
  const {
    resolveCompactionStatusText,
    shouldAutoScrollForThinkingTextUpdate,
    shouldRenderAssistantActions,
    shouldRenderUserActions,
  } = DesktopMessageListRuntime;
  const {
    resolveCurrentTurnPresentationState,
  } = DesktopCurrentTurnPresentationRuntime;

  test('awaiting-dot target picks latest user row only while awaiting reply', () => {
    const awaitingState = resolveCurrentTurnPresentationState({
      phase: 'idle',
      lifecycle: 'preflight',
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
      lifecycle: 'terminal',
      messages: [{ id: 'user-1', sender: 'user' }],
    });
    expect(notAwaitingState.awaitingDotTargetMessageId).toBeNull();
  });

  test('awaiting-dot target clears when current turn assistant thinking is visible', () => {
    const awaitingState = resolveCurrentTurnPresentationState({
      phase: 'awaiting-first-chunk',
      lifecycle: 'awaiting',
      messages: [
        { id: 'user-1', sender: 'user', text: 'think through this', type: 'user' },
        {
          id: 'assistant-1',
          sender: 'assistant',
          text: '',
          type: 'llm-text',
          thinkingText: 'Drafting plan',
          thinkingSourceEventType: 'llm-thought',
        },
      ],
    });

    expect(awaitingState.showAssistantAwaitingDot).toBe(false);
    expect(awaitingState.awaitingDotTargetMessageId).toBeNull();
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

  test('thinking-text auto-scroll requires same assistant llm-text row update', () => {
    expect(shouldAutoScrollForThinkingTextUpdate(
      [{ id: 'assistant-1', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking' }],
      [{ id: 'assistant-1', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking more' }],
    )).toBe(true);
    expect(shouldAutoScrollForThinkingTextUpdate(
      [{ id: 'assistant-1', sender: 'assistant', type: 'tool-output', thinkingText: 'Thinking' }],
      [{ id: 'assistant-1', sender: 'assistant', type: 'tool-output', thinkingText: 'Thinking more' }],
    )).toBe(false);
    expect(shouldAutoScrollForThinkingTextUpdate(
      [{ id: 'assistant-1', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking' }],
      [{ id: 'assistant-2', sender: 'assistant', type: 'llm-text', thinkingText: 'Thinking more' }],
    )).toBe(false);
  });
});
