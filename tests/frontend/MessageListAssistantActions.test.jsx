import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';

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

  test('copy action swaps to check icon for 4 seconds then reverts', async () => {
    jest.useFakeTimers();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { container } = render(
      <MessageList
        messages={[
          { id: 'assistant-1', text: 'copy me', sender: 'assistant', type: 'llm-text' },
        ]}
        thinkingStatus={null}
        enableAssistantActions
      />,
    );

    const copyButton = screen.getByRole('button', { name: 'Copy assistant message' });
    expect(copyButton).toHaveAttribute('title', 'Copy');
    expect(container.querySelector('svg.lucide-copy')).toBeTruthy();

    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('copy me');
    expect(copyButton).toHaveAttribute('title', 'Copied');
    expect(container.querySelector('svg.lucide-check')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(copyButton).toHaveAttribute('title', 'Copied');
    expect(container.querySelector('svg.lucide-check')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(copyButton).toHaveAttribute('title', 'Copy');
    expect(container.querySelector('svg.lucide-copy')).toBeTruthy();

    jest.useRealTimers();
  });

  test('user edit opens inline composer and sends updated text', () => {
    const onUserEdit = jest.fn();

    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'old text', sender: 'user', type: 'user' },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={onUserEdit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit and resend' }));

    const editor = screen.getByRole('group', { name: 'Edit user message' });
    const textarea = within(editor).getByDisplayValue('old text');
    fireEvent.change(textarea, { target: { value: 'new edited text' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Send' }));

    expect(onUserEdit).toHaveBeenCalledWith('user-1', 'new edited text');
    expect(screen.queryByRole('group', { name: 'Edit user message' })).not.toBeInTheDocument();
  });

  test('user edit cancel closes inline composer without sending', () => {
    const onUserEdit = jest.fn();

    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'old text', sender: 'user', type: 'user' },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={onUserEdit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit and resend' }));

    const editor = screen.getByRole('group', { name: 'Edit user message' });
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancel' }));

    expect(onUserEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Edit user message' })).not.toBeInTheDocument();
  });

  test('renders compacting status row under history when compaction is in progress', () => {
    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
        ]}
        thinkingStatus="Compacting conversation history..."
        thinkingSourceEventType="context-compaction-started"
      />,
    );

    expect(screen.getByLabelText('Conversation compaction in progress')).toBeInTheDocument();
    expect(screen.getByText('Compacting conversation history...')).toBeInTheDocument();
  });

  test('does not render compacting status row for non-compaction thinking states', () => {
    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
        ]}
        thinkingStatus="Thinking..."
        thinkingSourceEventType="llm-thought"
      />,
    );

    expect(screen.queryByLabelText('Conversation compaction in progress')).not.toBeInTheDocument();
  });
});
