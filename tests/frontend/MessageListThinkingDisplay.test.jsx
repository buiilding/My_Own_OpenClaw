import React from 'react';
import { render, screen } from '@testing-library/react';

import MessageList from '../../frontend/src/renderer/features/chat/components/MessageList';

describe('MessageList thinking display ordering', () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
      writable: true,
    });
  });

  test('keeps end anchor after thinking display so auto-scroll includes reasoning tokens', () => {
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
        thinkingStatus="Model reasoning chunk"
      />,
    );

    const endAnchor = screen.getByTestId('message-list-end');
    const thinkingDisplay = screen.getByRole('status');
    expect(endAnchor.parentElement?.lastElementChild).toBe(endAnchor);
    expect(
      thinkingDisplay.compareDocumentPosition(endAnchor) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
