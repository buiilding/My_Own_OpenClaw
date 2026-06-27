/**
 * Covers message list thinking display. behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import MessageList from '../../src/renderer/features/chat/components/MessageList';

describe('MessageList thinking display ordering', () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
      writable: true,
    });
  });

  test('keeps end anchor as final child (no global thinking strip)', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'assistant-1',
            text: 'hello',
            sender: 'assistant',
            type: 'llm-text',
          },
        ]}
      />,
    );

    const endAnchor = screen.getByTestId('message-list-end');
    expect(endAnchor.parentElement?.lastElementChild).toBe(endAnchor);
    expect(screen.queryByRole('status', { name: /assistant reasoning stream/i })).not.toBeInTheDocument();
  });
});
