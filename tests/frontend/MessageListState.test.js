import {
  findAwaitingDotTargetMessageId,
  resolveCompactionStatusText,
  shouldRenderAssistantActions,
  shouldRenderUserActions,
} from '../../frontend/src/renderer/features/chat/utils/message/messageListState';

describe('messageListState', () => {
  test('findAwaitingDotTargetMessageId returns latest user message id when enabled', () => {
    const id = findAwaitingDotTargetMessageId([
      { id: 'assistant-1', sender: 'assistant' },
      { id: 'user-1', sender: 'user' },
      { id: 'assistant-2', sender: 'assistant' },
      { id: 'user-2', sender: 'user' },
    ], true);
    expect(id).toBe('user-2');
    expect(findAwaitingDotTargetMessageId([{ id: 'user-1', sender: 'user' }], false)).toBeNull();
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
