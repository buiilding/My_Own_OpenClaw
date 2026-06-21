/**
 * Covers current turn presentation state hook. behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useCurrentTurnPresentationState } from '../../frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState';

function CurrentTurnPresentationProbe({
  messages = [],
  dismissedResponseId = null,
}) {
  const state = useCurrentTurnPresentationState({
    messages,
    dismissedResponseId,
  });

  return (
    <div
      data-testid="current-turn-presentation-probe"
      data-loop-ui-state={state.loopUiState}
      data-has-visible-reply={state.hasVisibleReply ? '1' : '0'}
      data-show-awaiting-dot={state.showAssistantAwaitingDot ? '1' : '0'}
      data-show-chatbox-awaiting={state.showChatboxAwaitingReply ? '1' : '0'}
      data-show-chatbox-response={state.showChatboxResponse ? '1' : '0'}
      data-visible-response-id={state.visibleResponse?.id || ''}
    />
  );
}

describe('useCurrentTurnPresentationState', () => {
  test('keeps later-turn tool rows as data without deciding awaiting lifecycle', () => {
    render(
      <CurrentTurnPresentationProbe
        messages={[
          { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
          { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
          { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
          { id: 'tool-call-2', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
          { id: 'tool-output-2', sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
        ]}
      />,
    );

    expect(screen.getByTestId('current-turn-presentation-probe').dataset.loopUiState).toBe('idle');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.hasVisibleReply).toBe('0');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showAwaitingDot).toBe('0');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxAwaiting).toBe('0');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxResponse).toBe('0');
  });

  test('projects the latest visible reply into chatbox response state', () => {
    render(
      <CurrentTurnPresentationProbe
        messages={[
          { id: 'user-1', sender: 'user', text: 'task', type: 'user' },
          { id: 'tool-call-1', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
          { id: 'assistant-2', sender: 'assistant', text: 'reply', type: 'llm-text' },
        ]}
      />,
    );

    expect(screen.getByTestId('current-turn-presentation-probe').dataset.loopUiState).toBe('idle');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.hasVisibleReply).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showAwaitingDot).toBe('0');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxResponse).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.visibleResponseId).toBe('assistant-2');
  });

  test('treats dismissed visible reply as hidden response data', () => {
    render(
      <CurrentTurnPresentationProbe
        dismissedResponseId="assistant-1"
        messages={[
          { id: 'user-1', sender: 'user', text: 'task', type: 'user' },
          { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
        ]}
      />,
    );

    expect(screen.getByTestId('current-turn-presentation-probe').dataset.hasVisibleReply).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxResponse).toBe('0');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.visibleResponseId).toBe('');
  });
});
