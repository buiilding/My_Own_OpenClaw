/**
 * Covers message source badge. behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import MessageSourceBadge from '../../src/renderer/features/chat/components/message/MessageSourceBadge';
import { DesktopDevUiRuntime } from '../../src/renderer/app/runtime/desktopDevUiRuntime';

jest.mock('../../src/renderer/app/runtime/desktopDevUiRuntime', () => ({
  DesktopDevUiRuntime: {
    isDevUiEnabled: jest.fn(),
  },
}));

describe('MessageSourceBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders source tag plus per-message user token estimate when dev ui is enabled', () => {
    DesktopDevUiRuntime.isDevUiEnabled.mockReturnValue(true);
    render(
      <MessageSourceBadge
        message={{
          sender: 'user',
          sourceEventType: 'local-user-message',
          sourceChannel: 'sdk:conversation-event',
          text: 'short',
          fullUserMessage: { content: '12345678' },
          screenshotRef: 'shot-1',
        }}
      />,
    );

    expect(screen.getByText(
      'user message / sdk:conversation-event / tokens~ txt:2 img(est):85 total:87',
    )).toBeInTheDocument();
  });

  test('renders source tag plus tool token estimate for tool output rows', () => {
    DesktopDevUiRuntime.isDevUiEnabled.mockReturnValue(true);
    render(
      <MessageSourceBadge
        message={{
          sender: 'assistant',
          type: 'tool-output',
          sourceEventType: 'tool-output',
          sourceChannel: 'sdk-local-runtime',
          text: 'abcd',
        }}
      />,
    );

    expect(screen.getByText('tool output / sdk-local-runtime / tokens~ 1')).toBeInTheDocument();
  });

  test('renders provider-reported token usage when attached to an assistant message', () => {
    DesktopDevUiRuntime.isDevUiEnabled.mockReturnValue(true);
    render(
      <MessageSourceBadge
        message={{
          sender: 'assistant',
          type: 'llm-text',
          sourceEventType: 'streaming-complete',
          sourceChannel: 'sdk:conversation-event',
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
      screen.getByText('assistant completion / sdk:conversation-event / tokens(provider) out:5 vis:3 think:2 turn:17'),
    ).toBeInTheDocument();
  });

  test('does not render when dev ui is disabled', () => {
    DesktopDevUiRuntime.isDevUiEnabled.mockReturnValue(false);
    const { container } = render(
      <MessageSourceBadge
        message={{
          sender: 'user',
          sourceEventType: 'local-user-message',
          sourceChannel: 'sdk:conversation-event',
          text: 'hello',
        }}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
