import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MessageList from '../../frontend/src/renderer/features/chat/components/MessageList';

describe('MessageList assistant actions', () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
      writable: true,
    });
  });

  test('renders copy/like/dislike/try-again actions for assistant llm messages', () => {
    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'world', sender: 'assistant', type: 'llm-text' },
        ]}
        thinkingStatus={null}
        enableAssistantActions
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy assistant message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like response' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dislike response' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  test('does not render assistant actions for tool-call/tool-output messages', () => {
    render(
      <MessageList
        messages={[
          { id: 'tool-call-1', text: '{}', sender: 'assistant', type: 'tool-call' },
          { id: 'tool-output-1', text: '{}', sender: 'assistant', type: 'tool-output' },
        ]}
        thinkingStatus={null}
        enableAssistantActions
      />,
    );

    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  test('calls retry callback with assistant message id', () => {
    const onAssistantTryAgain = jest.fn();

    render(
      <MessageList
        messages={[
          { id: 'assistant-1', text: 'final answer', sender: 'assistant', type: 'llm-text' },
        ]}
        thinkingStatus={null}
        enableAssistantActions
        onAssistantTryAgain={onAssistantTryAgain}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onAssistantTryAgain).toHaveBeenCalledWith('assistant-1');
  });
});
