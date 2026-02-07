import React from 'react';
import { render, screen } from '@testing-library/react';

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
});
