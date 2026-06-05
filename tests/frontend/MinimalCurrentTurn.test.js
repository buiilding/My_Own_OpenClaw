import { hasMinimalCurrentTurnContent } from '../../frontend/src/renderer/features/minimalChatPill/useMinimalCurrentTurn';

describe('minimal current-turn projection helpers', () => {
  function currentTurn(overrides = {}) {
    return {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'awaiting',
      assistantText: '',
      reasoningText: '',
      toolEvents: [],
      lastError: null,
      ...overrides,
    };
  }

  test('does not treat an awaiting projection with no backend content as overlay content', () => {
    expect(hasMinimalCurrentTurnContent(currentTurn())).toBe(false);
  });

  test('treats assistant text, reasoning, errors, and tool events as overlay content', () => {
    expect(hasMinimalCurrentTurnContent(currentTurn({ assistantText: 'hello' }))).toBe(true);
    expect(hasMinimalCurrentTurnContent(currentTurn({ reasoningText: 'thinking' }))).toBe(true);
    expect(hasMinimalCurrentTurnContent(currentTurn({ lastError: 'failed' }))).toBe(true);
    expect(hasMinimalCurrentTurnContent(currentTurn({
      toolEvents: [{ id: 'tool-1', kind: 'tool_call', toolName: 'mouse_control', payload: {} }],
    }))).toBe(true);
  });
});
