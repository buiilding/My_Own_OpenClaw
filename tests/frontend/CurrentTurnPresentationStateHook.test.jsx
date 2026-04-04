import React from 'react';
import { render, screen } from '@testing-library/react';
import { useCurrentTurnPresentationState } from '../../frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState';

const mockListeners = new Map();
const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (channel, listener) => {
      mockListeners.set(channel, listener);
      return () => {
        mockListeners.delete(channel);
      };
    },
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    GET_CLIENT_USER_ID: 'get-client-user-id',
  },
  ON_CHANNELS: {
    IPC_STATUS: 'ipc-status',
  },
}));

function CurrentTurnPresentationProbe({
  phase = 'idle',
  isSending = false,
  messages = [],
  dismissedResponseId = null,
}) {
  const state = useCurrentTurnPresentationState({
    phase,
    isSending,
    messages,
    dismissedResponseId,
  });

  return (
    <div
      data-testid="current-turn-presentation-probe"
      data-overlay-turn-lifecycle={state.overlayTurnLifecycle}
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
  beforeEach(() => {
    mockListeners.clear();
    mockInvoke.mockReset();
    mockInvoke.mockRejectedValue(new Error('ipc unavailable in test'));
  });

  test('keeps later-turn tool rows in awaiting state until a visible reply appears', () => {
    render(
      <CurrentTurnPresentationProbe
        phase="tool-output"
        messages={[
          { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
          { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
          { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
          { id: 'tool-call-2', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
          { id: 'tool-output-2', sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
        ]}
      />,
    );

    expect(screen.getByTestId('current-turn-presentation-probe').dataset.overlayTurnLifecycle).toBe('active');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.loopUiState).toBe('awaiting-reply');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.hasVisibleReply).toBe('0');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showAwaitingDot).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxAwaiting).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxResponse).toBe('0');
  });

  test('projects the latest visible reply into chatbox response state', () => {
    render(
      <CurrentTurnPresentationProbe
        phase="streaming"
        messages={[
          { id: 'user-1', sender: 'user', text: 'task', type: 'user' },
          { id: 'tool-call-1', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
          { id: 'assistant-2', sender: 'assistant', text: 'reply', type: 'llm-text' },
        ]}
      />,
    );

    expect(screen.getByTestId('current-turn-presentation-probe').dataset.overlayTurnLifecycle).toBe('active');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.loopUiState).toBe('active-response');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.hasVisibleReply).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showAwaitingDot).toBe('0');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxResponse).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.visibleResponseId).toBe('assistant-2');
  });

  test('keeps later-turn terminal handoff in awaiting state when the new user turn has no visible reply yet', () => {
    render(
      <CurrentTurnPresentationProbe
        phase="complete"
        isSending
        messages={[
          { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
          { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
          { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
        ]}
      />,
    );

    expect(screen.getByTestId('current-turn-presentation-probe').dataset.overlayTurnLifecycle).toBe('preflight');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.loopUiState).toBe('awaiting-reply');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showAwaitingDot).toBe('1');
    expect(screen.getByTestId('current-turn-presentation-probe').dataset.showChatboxAwaiting).toBe('1');
  });
});
