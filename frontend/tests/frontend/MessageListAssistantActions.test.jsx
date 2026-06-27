/**
 * Covers message list assistant actions. behavior in the frontend test suite.
 */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import MessageList from '../../src/renderer/features/chat/components/MessageList';

const mockIsDevUiEnabled = jest.fn(() => false);

jest.mock('../../src/renderer/app/runtime/desktopDevUiRuntime', () => ({
  DesktopDevUiRuntime: {
    isDevUiEnabled: () => mockIsDevUiEnabled(),
  },
}));

describe('MessageList assistant actions', () => {
  beforeEach(() => {
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('reveals local copy/feedback actions 2 seconds after an assistant llm message completes', () => {
    jest.useFakeTimers();

    const { container } = render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'world', sender: 'assistant', type: 'llm-text', isComplete: true },
        ]}
        thinkingStatus={null}
        enableAssistantActions
      />,
    );

    expect(screen.getByTestId('assistant-message-actions-placeholder')).toBeInTheDocument();
    expect(container.querySelector('.assistant-message-actions-placeholder')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(screen.getByRole('button', { name: 'Copy assistant message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like response' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dislike response' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Assistant message actions' })).toHaveClass('assistant-message-actions-enter');
    expect(screen.queryByTestId('assistant-message-actions-placeholder')).not.toBeInTheDocument();
  });

  test('does not render assistant actions for tool-call/tool-output messages', () => {
    jest.useFakeTimers();

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

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  test('renders compaction debug summary in development when payload is present', () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    render(
      <MessageList
        messages={[]}
        thinkingStatus="Conversation compacted."
        thinkingSourceEventType="context-compaction-completed"
        compactionDebugInfo={{
          reason: 'manual',
          strategy: 'inline',
          beforeTokens: 2400,
          afterTokens: 900,
          removedMessages: 10,
          summaryPreview: 'short summary',
          summaryText: 'full compacted history summary',
          replacementHistoryPreview: [
            {
              role: 'assistant',
              messageType: 'context_compaction',
              content: '[[CONTEXT COMPACTION SUMMARY]]\nfull compacted history summary',
              toolName: null,
              toolCallId: null,
            },
            {
              role: 'user',
              messageType: 'user_query',
              content: 'latest user turn',
              toolName: null,
              toolCallId: null,
            },
          ],
          skippedReason: null,
        }}
      />,
    );

    expect(screen.getByText('Compacted History Summary')).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('[[CONTEXT COMPACTION SUMMARY]]') && content.includes('full compacted history summary')),
    ).toBeInTheDocument();
    expect(screen.getByText('Replacement History')).toBeInTheDocument();
    expect(screen.getByText('latest user turn')).toBeInTheDocument();
    expect(screen.getByText(/Before tokens:/i)).toBeInTheDocument();
  });

  test('does not render compaction debug summary for skipped compaction', () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    render(
      <MessageList
        messages={[]}
        thinkingStatus={null}
        thinkingSourceEventType={null}
        compactionDebugInfo={{
          reason: 'auto-mid',
          strategy: null,
          beforeTokens: 167141,
          afterTokens: null,
          removedMessages: null,
          summaryPreview: null,
          summaryText: null,
          replacementHistoryPreview: [],
          skippedReason: 'insufficient-history',
        }}
      />,
    );

    expect(screen.queryByText('Compacted History Summary')).not.toBeInTheDocument();
    expect(screen.queryByText('No replacement history preview.')).not.toBeInTheDocument();
  });

  test('does not render assistant actions while assistant text is still streaming', () => {
    jest.useFakeTimers();

    render(
      <MessageList
        messages={[
          { id: 'assistant-1', text: 'partial', sender: 'assistant', type: 'llm-text', isComplete: false },
        ]}
        thinkingStatus={null}
        enableAssistantActions
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  test('waits for the turn to finish before starting the delayed action reveal', () => {
    jest.useFakeTimers();
    const { rerender } = render(
      <MessageList
        messages={[
          {
            id: 'assistant-1',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            actions: { canRetry: true },
          },
        ]}
        thinkingStatus={null}
        enableAssistantActions
        disableAssistantActions
      />,
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    rerender(
      <MessageList
        messages={[
          {
            id: 'assistant-1',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            actions: { canRetry: true },
          },
        ]}
        thinkingStatus={null}
        enableAssistantActions
        disableAssistantActions={false}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  test('calls retry callback with assistant message id', () => {
    jest.useFakeTimers();
    const onAssistantTryAgain = jest.fn();

    render(
      <MessageList
        messages={[
          {
            id: 'assistant-1',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            actions: { canRetry: true },
          },
        ]}
        thinkingStatus={null}
        enableAssistantActions
        onAssistantTryAgain={onAssistantTryAgain}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onAssistantTryAgain).toHaveBeenCalledWith('assistant-1');
  });

  test('uses SDK retry target id and hides only retry when row disallows it', () => {
    jest.useFakeTimers();
    const onAssistantTryAgain = jest.fn();
    const { rerender } = render(
      <MessageList
        messages={[
          {
            id: 'assistant-visible',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            actions: {
              canRetry: true,
              retryTargetRowId: 'assistant-original',
            },
          },
        ]}
        thinkingStatus={null}
        enableAssistantActions
        onAssistantTryAgain={onAssistantTryAgain}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onAssistantTryAgain).toHaveBeenCalledWith('assistant-original');

    rerender(
      <MessageList
        messages={[
          {
            id: 'assistant-visible',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            actions: {
              canRetry: false,
            },
          },
        ]}
        thinkingStatus={null}
        enableAssistantActions
        onAssistantTryAgain={onAssistantTryAgain}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: 'Copy assistant message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like response' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  test('requires explicit SDK retry availability for SDK display rows', () => {
    jest.useFakeTimers();
    render(
      <MessageList
        messages={[
          {
            id: 'assistant-sdk',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            sourceChannel: 'sdk:display-rows',
            isComplete: true,
          },
        ]}
        thinkingStatus={null}
        enableAssistantActions
        onAssistantTryAgain={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: 'Copy assistant message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like response' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  test('submits user message edits and keeps the editor busy until replay dispatch resolves', async () => {
    let resolveEdit;
    const onUserEdit = jest.fn(() => new Promise((resolve) => {
      resolveEdit = resolve;
    }));

    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'old text', sender: 'user', type: 'user', actions: { canEdit: true } },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={onUserEdit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit and resend' }));
    const editor = screen.getByRole('group', { name: 'Edit user message' });
    fireEvent.change(within(editor).getByRole('textbox'), {
      target: { value: 'new text' },
    });

    fireEvent.click(within(editor).getByRole('button', { name: 'Send' }));

    expect(onUserEdit).toHaveBeenCalledWith('user-1', 'new text');
    expect(within(editor).getByRole('textbox')).toBeDisabled();
    expect(within(editor).getByRole('button', { name: 'Send' })).toBeDisabled();

    await act(async () => {
      resolveEdit(true);
    });

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Edit user message' })).not.toBeInTheDocument();
    });
  });

  test('uses SDK edit target id and hides only edit when row disallows it', async () => {
    const onUserEdit = jest.fn();
    const { rerender } = render(
      <MessageList
        messages={[
          {
            id: 'user-visible',
            text: 'old text',
            sender: 'user',
            type: 'user',
            actions: {
              canEdit: true,
              editTargetRowId: 'user-original',
            },
          },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={onUserEdit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit and resend' }));
    const editor = screen.getByRole('group', { name: 'Edit user message' });
    fireEvent.change(within(editor).getByRole('textbox'), {
      target: { value: 'new text' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Send' }));

    expect(onUserEdit).toHaveBeenCalledWith('user-original', 'new text');

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Edit user message' })).not.toBeInTheDocument();
    });

    rerender(
      <MessageList
        messages={[
          {
            id: 'user-visible',
            text: 'old text',
            sender: 'user',
            type: 'user',
            actions: {
              canEdit: false,
            },
          },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={onUserEdit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy user message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit and resend' })).not.toBeInTheDocument();
  });

  test('requires explicit row edit availability before showing edit controls', () => {
    const { rerender } = render(
      <MessageList
        messages={[
          {
            id: 'user-local',
            text: 'old text',
            sender: 'user',
            type: 'user',
            sourceChannel: 'renderer-local',
          },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy user message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit and resend' })).not.toBeInTheDocument();

    rerender(
      <MessageList
        messages={[
          {
            id: 'user-sdk',
            text: 'old text',
            sender: 'user',
            type: 'user',
            sourceChannel: 'sdk:display-rows',
          },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy user message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit and resend' })).not.toBeInTheDocument();
  });

  test('keeps user message editor open when replay dispatch reports failure', async () => {
    const onUserEdit = jest.fn(async () => false);

    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'old text', sender: 'user', type: 'user', actions: { canEdit: true } },
        ]}
        thinkingStatus={null}
        enableUserActions
        onUserEdit={onUserEdit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit and resend' }));
    const editor = screen.getByRole('group', { name: 'Edit user message' });
    fireEvent.change(within(editor).getByRole('textbox'), {
      target: { value: 'new text' },
    });
    fireEvent.click(within(editor).getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Edit user message' })).toBeInTheDocument();
    });
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
          { id: 'assistant-1', text: 'copy me', sender: 'assistant', type: 'llm-text', isComplete: true },
        ]}
        thinkingStatus={null}
        enableAssistantActions
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

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

  test('user edit opens inline composer and sends updated text', async () => {
    const onUserEdit = jest.fn();

    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'old text', sender: 'user', type: 'user', actions: { canEdit: true } },
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
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Edit user message' })).not.toBeInTheDocument();
    });
  });

  test('user edit cancel closes inline composer without sending', () => {
    const onUserEdit = jest.fn();

    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'old text', sender: 'user', type: 'user', actions: { canEdit: true } },
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

  test('renders compacted status row under history when compaction completes', () => {
    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
        ]}
        thinkingStatus="Conversation history compacted."
        thinkingSourceEventType="context-compaction-completed"
      />,
    );

    expect(screen.getByLabelText('Conversation compaction completed')).toBeInTheDocument();
    expect(screen.getByText('Conversation history compacted.')).toBeInTheDocument();
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

  test('renders assistant awaiting dot while waiting for first token', () => {
    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
        ]}
        awaitingDotTargetMessageId="user-1"
      />,
    );

    expect(screen.getByLabelText('Assistant is preparing response')).toBeInTheDocument();
  });

  test('renders assistant awaiting dot directly after latest user message', () => {
    const { container } = render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'first', sender: 'user', type: 'user' },
          { id: 'assistant-1', text: 'reply', sender: 'assistant', type: 'llm-text' },
          { id: 'user-2', text: 'second', sender: 'user', type: 'user' },
        ]}
        awaitingDotTargetMessageId="user-2"
      />,
    );

    const latestUserMessage = screen.getByText('second').closest('.message');
    const awaitingDot = screen.getByLabelText('Assistant is preparing response');
    expect(awaitingDot.previousElementSibling).toBe(latestUserMessage);
    expect(container.querySelector('.message-list-awaiting-dot-inline')).toBe(awaitingDot);
  });

  test('does not render assistant awaiting dot by default', () => {
    render(
      <MessageList
        messages={[
          { id: 'user-1', text: 'hello', sender: 'user', type: 'user' },
        ]}
      />,
    );

    expect(screen.queryByLabelText('Assistant is preparing response')).not.toBeInTheDocument();
  });
});
