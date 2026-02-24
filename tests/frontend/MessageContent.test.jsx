import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MessageContent from '../../frontend/src/renderer/features/chat/components/MessageContent';

jest.mock('../../frontend/src/renderer/infrastructure/markdown', () => ({
  toSanitizedMarkdownHtml: jest.fn((text) => text),
}));

describe('MessageContent', () => {
  test('prefers screenshot URL over inline screenshot data', () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          screenshotUrl: 'https://cdn.example/screenshot.png',
          screenshot: 'inline-base64',
        }}
      />,
    );

    const image = screen.getByRole('img', { name: 'User message screenshot' });
    expect(image.getAttribute('src')).toBe('https://cdn.example/screenshot.png');
  });

  test('renders inline screenshot data URL with png content type', () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          screenshot: 'abc123',
          screenshotContentType: 'image/png',
        }}
      />,
    );

    const image = screen.getByRole('img', { name: 'User message screenshot' });
    expect(image.getAttribute('src')).toBe('data:image/png;base64,abc123');
  });

  test('defaults inline screenshot data URL to jpeg when content type missing', () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-output',
          text: 'result',
          screenshot: 'tool-shot',
        }}
      />,
    );

    const image = screen.getByRole('img', { name: 'Screenshot after tool execution' });
    expect(image.getAttribute('src')).toBe('data:image/jpeg;base64,tool-shot');
  });

  test('tool output details button reveals model-facing output and details payload', () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-output',
          text: 'fallback output',
          modelFacingToolOutput: 'model-facing output',
          toolOutputDetails: { request_id: 'req-1', metadata: { source: 'backend' } },
        }}
      />,
    );

    expect(screen.getByText('model-facing output')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Model-Facing Tool Output')).toBeInTheDocument();
    expect(screen.getByText(/"request_id": "req-1"/)).toBeInTheDocument();
  });

  test('tool call details button reveals model-facing tool call JSON', () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-call',
          text: 'legacy tool call',
          modelFacingToolCall: {
            id: 'tool_1',
            name: 'read_file',
            arguments: { file_path: '/tmp/a' },
          },
          toolCallDetails: {
            tool_name: 'read_file',
            parameters: { file_path: '/tmp/a' },
            request_id: 'req-1',
          },
        }}
      />,
    );

    expect(screen.getByText(/"name": "read_file"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Model-Facing Tool Call')).toBeInTheDocument();
    expect(screen.getByText(/"request_id": "req-1"/)).toBeInTheDocument();
  });
});
