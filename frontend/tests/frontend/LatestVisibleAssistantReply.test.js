/**
 * Covers latest visible assistant reply. behavior in the frontend test suite.
 */

import { DesktopCurrentTurnPresentationRuntime } from '../../src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime';

describe('desktopCurrentTurnPresentationRuntime visible reply helpers', () => {
  const {
    resolveCurrentTurnPresentationState,
  } = DesktopCurrentTurnPresentationRuntime;

  test('does not derive awaiting-dot state from message rows', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [
        { id: 'user-1', sender: 'user', text: 'first' },
        { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text' },
        { id: 'user-2', sender: 'user', text: 'second' },
      ],
    });

    expect(state.awaitingDotTargetMessageId).toBeNull();
  });

  test('ignores tool rows after the latest user until a visible assistant reply exists', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [
        { sender: 'user', text: 'first task', type: 'user' },
        { sender: 'assistant', text: 'done', type: 'llm-text' },
        { sender: 'user', text: 'second task', type: 'user' },
        { sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
        { sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
      ],
    });

    expect(state.activeResponse).toBeNull();
    expect(state.hasVisibleReply).toBe(false);
  });

  test('selects the latest visible assistant reply after the latest user', () => {
    const state = resolveCurrentTurnPresentationState({
      messages: [
        { sender: 'user', text: 'first task', type: 'user' },
        { sender: 'assistant', text: 'done', type: 'llm-text' },
        { sender: 'user', text: 'second task', type: 'user' },
        { sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
        { sender: 'assistant', text: 'final', type: 'llm-text' },
      ],
    });

    expect(state.activeResponse).toEqual({
      sender: 'assistant',
      text: 'final',
      type: 'llm-text',
    });
  });
});
