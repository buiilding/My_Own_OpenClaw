import React from 'react';
import { render, screen } from '@testing-library/react';

import MessageTransparencySections from '../../frontend/src/renderer/features/chat/components/MessageTransparencySections';

const mockIsDevUiEnabled = jest.fn(() => false);

jest.mock('../../frontend/src/renderer/features/chat/utils/devUiFlag', () => ({
  isDevUiEnabled: () => mockIsDevUiEnabled(),
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
};

describe('MessageTransparencySections mode gating', () => {
  test('hides transparency sections when dev_ui query flag is not present', () => {
    mockIsDevUiEnabled.mockReturnValue(false);
    render(<MessageTransparencySections message={messageWithTransparency} />);

    expect(screen.queryByText(/System Prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tool Schemas \(Available Tools\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full Message Sent to Assistant \(Complete\)/i)).not.toBeInTheDocument();
  });

  test('shows transparency sections when dev_ui query flag is enabled', () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    render(<MessageTransparencySections message={messageWithTransparency} />);

    expect(screen.getByText(/System Prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/Tool Schemas \(Available Tools\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Full Message Sent to Assistant \(Complete\)/i)).toBeInTheDocument();
  });
});
