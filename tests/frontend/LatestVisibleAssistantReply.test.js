import {
  findLastUserIndex,
  findLatestVisibleAssistantReply,
} from '../../frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState';

describe('chatTurnPresentationState visible reply helpers', () => {
  test('finds the latest user index', () => {
    expect(findLastUserIndex([
      { sender: 'user', text: 'first' },
      { sender: 'assistant', text: 'reply' },
      { sender: 'user', text: 'second' },
    ])).toBe(2);
  });

  test('ignores tool rows after the latest user and returns null until a visible assistant reply exists', () => {
    const visibleReplyTypes = new Set(['llm-text', 'error']);
    expect(findLatestVisibleAssistantReply([
      { sender: 'user', text: 'first task', type: 'user' },
      { sender: 'assistant', text: 'done', type: 'llm-text' },
      { sender: 'user', text: 'second task', type: 'user' },
      { sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
      { sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
    ], visibleReplyTypes)).toBeNull();
  });

  test('returns the latest visible assistant reply after the latest user', () => {
    const visibleReplyTypes = new Set(['llm-text', 'error']);
    expect(findLatestVisibleAssistantReply([
      { sender: 'user', text: 'first task', type: 'user' },
      { sender: 'assistant', text: 'done', type: 'llm-text' },
      { sender: 'user', text: 'second task', type: 'user' },
      { sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
      { sender: 'assistant', text: 'final', type: 'llm-text' },
    ], visibleReplyTypes)).toEqual({
      sender: 'assistant',
      text: 'final',
      type: 'llm-text',
    });
  });
});
