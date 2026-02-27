import React from 'react';
import { render, screen } from '@testing-library/react';

import MessageTransparencySections from '../../frontend/src/renderer/features/chat/components/MessageTransparencySections';

const messageWithTransparency = {
  systemPrompt: { content: 'system content' },
  toolSchemas: [
    {
      type: 'function',
      function: {
        name: 'click',
        parameters: { type: 'object', properties: {} },
      },
    },
  ],
  fullUserMessage: {
    content: '<user_message>hello</user_message>',
    metadata: { test: true },
  },
  fullAssistantMessage: {
    content: '<assistant_message>hi</assistant_message>',
  },
};

describe('MessageTransparencySections', () => {
  test('renders nothing when message has no transparency payloads', () => {
    render(<MessageTransparencySections message={{ text: 'hello' }} />);

    expect(screen.queryByText(/System Prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tool Schemas \(Available Tools\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Message Sent to Assistant \(Complete\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Assistant Message \(Complete\)/i)).not.toBeInTheDocument();
  });

  test('shows all transparency sections when message has transparency payloads', () => {
    render(<MessageTransparencySections message={messageWithTransparency} />);

    expect(screen.getByText(/System Prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/Tool Schemas \(Available Tools\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Message Sent to Assistant \(Complete\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Assistant Message \(Complete\)/i)).toBeInTheDocument();
  });
});
