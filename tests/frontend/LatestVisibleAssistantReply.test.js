/**
 * Covers latest visible assistant reply. behavior in the frontend test suite.
 */

import { DesktopCurrentTurnPresentationRuntime } from '../../frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime';

describe('desktopCurrentTurnPresentationRuntime visible reply helpers', () => {
  const {
    resolveCurrentTurnPresentationState,
  } = DesktopCurrentTurnPresentationRuntime;

  test('targets the latest user row for awaiting-dot rendering', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'idle',
      lifecycle: 'preflight',
      messages: [
        { id: 'user-1', sender: 'user', text: 'first' },
        { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text' },
        { id: 'user-2', sender: 'user', text: 'second' },
      ],
    });

    expect(state.awaitingDotTargetMessageId).toBe('user-2');
  });

  test('ignores tool rows after the latest user until a visible assistant reply exists', () => {
    const state = resolveCurrentTurnPresentationState({
      phase: 'tool-output',
      lifecycle: 'active',
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
      phase: 'streaming',
      lifecycle: 'active',
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
