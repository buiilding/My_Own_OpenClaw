/**
 * Covers message content thinking. behavior in the frontend test suite.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MessageContent from '../../src/renderer/features/chat/components/MessageContent';

describe('MessageContent assistant thinking section', () => {
  test('renders collapsed thinking toggle above assistant response and expands on click', () => {
    render(
      <MessageContent
        message={{
          id: 'assistant-1',
          sender: 'assistant',
          type: 'llm-text',
          text: 'Here is the answer.',
          thinkingText: 'Step A\nStep B',
          thinkingSourceEventType: 'llm-thought',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /show thinking/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Assistant reasoning details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show thinking/i }));
    expect(screen.getByLabelText('Assistant reasoning details')).toBeInTheDocument();
    expect(screen.getByText(/Step A/)).toBeInTheDocument();
    expect(screen.getByText(/Here is the answer/)).toBeInTheDocument();
  });

  test('renders thinking section without blank markdown bubble when assistant text is empty', () => {
    const { container } = render(
      <MessageContent
        message={{
          id: 'assistant-2',
          sender: 'assistant',
          type: 'llm-text',
          text: '',
          thinkingText: 'Internal reasoning',
          thinkingSourceEventType: 'llm-thought',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /show thinking/i })).toBeInTheDocument();
    expect(container.querySelector('.message-content-markdown')).toBeNull();
  });
});
