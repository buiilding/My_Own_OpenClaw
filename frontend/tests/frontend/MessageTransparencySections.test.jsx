/**
 * Covers message transparency sections. behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import MessageTransparencySections from '../../src/renderer/features/chat/components/message/MessageTransparencySections';

const mockIsDevUiEnabled = jest.fn(() => false);

jest.mock('../../src/renderer/app/runtime/desktopDevUiRuntime', () => ({
  DesktopDevUiRuntime: {
    isDevUiEnabled: () => mockIsDevUiEnabled(),
  },
}));

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
  beforeEach(() => {
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
  });

  test('renders nothing when message has no transparency payloads', () => {
    render(<MessageTransparencySections message={{ text: 'hello' }} />);

    expect(screen.queryByText(/System Prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tool Schemas \(Available Tools\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Message Sent to Assistant \(Complete\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Assistant Message \(Complete\)/i)).not.toBeInTheDocument();
  });

  test('renders nothing when dev UI is disabled even with transparency payloads', () => {
    render(<MessageTransparencySections message={messageWithTransparency} />);

    expect(screen.queryByText(/System Prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tool Schemas \(Available Tools\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Message Sent to Assistant \(Complete\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Assistant Message \(Complete\)/i)).not.toBeInTheDocument();
  });

  test('shows all transparency sections when dev UI is enabled', () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    render(<MessageTransparencySections message={messageWithTransparency} />);

    expect(screen.getByText(/System Prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/Tool Schemas \(Available Tools\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Message Sent to Assistant \(Complete\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Assistant Message \(Complete\)/i)).toBeInTheDocument();
  });
});
