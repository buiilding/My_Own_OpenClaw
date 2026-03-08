import React from 'react';
import { render, screen } from '@testing-library/react';
import MessageSourceBadge from '../../frontend/src/renderer/features/chat/components/message/MessageSourceBadge';
import { isDevUiEnabled } from '../../frontend/src/renderer/features/chat/utils/devUiFlag';

jest.mock('../../frontend/src/renderer/features/chat/utils/devUiFlag', () => ({
  isDevUiEnabled: jest.fn(),
}));

describe('MessageSourceBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders source tag plus per-message user token estimate when dev ui is enabled', () => {
    isDevUiEnabled.mockReturnValue(true);
    render(
      <MessageSourceBadge
        message={{
          sender: 'user',
          sourceEventType: 'local-user-message',
          sourceChannel: 'from-backend',
          text: 'short',
          fullUserMessage: { content: '12345678' },
          screenshotRef: 'shot-1',
        }}
      />,
    );

    expect(screen.getByText(
      'local-user-message API · from-backend · tokens~ txt:2 img(est):85 total:87',
    )).toBeInTheDocument();
  });

  test('renders source tag plus tool token estimate for tool output rows', () => {
    isDevUiEnabled.mockReturnValue(true);
    render(
      <MessageSourceBadge
        message={{
          sender: 'assistant',
          type: 'tool-output',
          sourceEventType: 'tool-output',
          sourceChannel: 'renderer-tool-runner',
          text: 'abcd',
        }}
      />,
    );

    expect(screen.getByText('tool-output API · renderer-tool-runner · tokens~ 1')).toBeInTheDocument();
  });

  test('renders provider-reported token usage when attached to an assistant message', () => {
    isDevUiEnabled.mockReturnValue(true);
    render(
      <MessageSourceBadge
        message={{
          sender: 'assistant',
          type: 'llm-text',
          sourceEventType: 'streaming-complete',
          sourceChannel: 'from-backend',
          text: 'final answer',
          tokenCounts: {
            visible_output_tokens: 3,
            thinking_tokens: 2,
            output_tokens_total: 5,
            total_tokens: 17,
            usage_source: 'provider',
          },
        }}
      />,
    );

    expect(
      screen.getByText('streaming-complete API · from-backend · tokens(provider) out:5 vis:3 think:2 turn:17'),
    ).toBeInTheDocument();
  });

  test('does not render when dev ui is disabled', () => {
    isDevUiEnabled.mockReturnValue(false);
    const { container } = render(
      <MessageSourceBadge
        message={{
          sender: 'user',
          sourceEventType: 'local-user-message',
          sourceChannel: 'from-backend',
          text: 'hello',
        }}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
