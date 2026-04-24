import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import MessageContent from '../../frontend/src/renderer/features/chat/components/MessageContent';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

jest.mock('../../frontend/src/renderer/infrastructure/markdown', () => ({
  toSanitizedMarkdownHtml: jest.fn((text) => text),
  extractTextFromHtml: jest.fn((html) => html),
  highlightSanitizedHtml: jest.fn((html) => html),
  highlightPlainTextToHtml: jest.fn((text) => text),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => {
  const actualModule = jest.requireActual('../../frontend/src/renderer/infrastructure/ipc/bridge');
  return {
    ...actualModule,
    IpcBridge: {
      ...actualModule.IpcBridge,
      invoke: jest.fn().mockResolvedValue({ success: true }),
    },
  };
});

describe('MessageContent', () => {
  beforeEach(() => {
    IpcBridge.invoke.mockClear();
    IpcBridge.invoke.mockImplementation(async (channel) => {
      if (channel === INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE) {
        return {
          success: true,
          dataUrl: 'data:image/png;base64,resolved-artifact-image',
        };
      }
      return { success: true };
    });
  });

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

  test('renders multiple user screenshots when message includes screenshots array', () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          screenshots: [
            { screenshotUrl: 'https://cdn.example/screenshot-a.png' },
            { screenshot: 'inline-b', screenshotContentType: 'image/png' },
          ],
        }}
      />,
    );

    const firstImage = screen.getByRole('img', { name: 'User message screenshot 1' });
    const secondImage = screen.getByRole('img', { name: 'User message screenshot 2' });
    expect(firstImage.getAttribute('src')).toBe('https://cdn.example/screenshot-a.png');
    expect(secondImage.getAttribute('src')).toBe('data:image/png;base64,inline-b');
  });

  test('renders authenticated artifact screenshots via IPC-backed data url resolution', async () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-output',
          text: 'result',
          screenshotRef: 'artifact-1',
        }}
      />,
    );

    await waitFor(() => {
      const image = screen.getByRole('img', { name: 'Screenshot after tool execution' });
      expect(image.getAttribute('src')).toBe('data:image/png;base64,resolved-artifact-image');
    });

    const artifactFetchCall = IpcBridge.invoke.mock.calls.find(
      ([channel]) => channel === INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE,
    );
    expect(Boolean(artifactFetchCall)).toBe(true);
    expect(artifactFetchCall[1].artifactId).toBe('artifact-1');
  });

  test('shows the native image context menu through IPC on right click', async () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          screenshotUrl: 'https://cdn.example/screenshot.png',
        }}
      />,
    );

    const image = screen.getByRole('img', { name: 'User message screenshot' });

    await act(async () => {
      fireEvent.contextMenu(image);
    });

    await waitFor(() => {
      expect(IpcBridge.invoke).toHaveBeenCalledWith(
        INVOKE_CHANNELS.SHOW_IMAGE_CONTEXT_MENU,
        { src: 'https://cdn.example/screenshot.png' },
      );
    });
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
    expect(screen.getByText('Tool Output Details')).toBeInTheDocument();
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
    expect(screen.getByText('Tool Call Details')).toBeInTheDocument();
    expect(screen.getByText(/"request_id": "req-1"/)).toBeInTheDocument();
  });

  test('tool call display prefers dedicated toolCallDisplayText over legacy text', () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-call',
          text: 'legacy normalized view',
          toolCallDisplayText: '{"id":"tool_2","name":"run_shell_command"}',
          modelFacingToolCall: {
            id: 'tool_2',
            name: 'run_shell_command',
            arguments: { command: 'pwd', run_in_background: false },
          },
          toolCallDetails: {
            tool_name: 'run_shell_command',
            request_id: 'req-2',
          },
        }}
      />,
    );

    expect(screen.getByText('{"id":"tool_2","name":"run_shell_command"}')).toBeInTheDocument();
    expect(screen.queryByText('legacy normalized view')).not.toBeInTheDocument();
  });

  test('renders tool explanation rows as subdued plain text', () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-explanation',
          text: 'Inspect the selected workspace before editing files.',
        }}
      />,
    );

    expect(screen.getByText('Inspect the selected workspace before editing files.')).toBeInTheDocument();
  });

  test('renders collapsed tool action summaries with expandable explanations', () => {
    render(
      <MessageContent
        message={{
          id: 'summary-1',
          sender: 'assistant',
          type: 'tool-actions-summary',
          text: '2 actions',
          actionExplanations: [
            'Inspect the selected workspace before editing files.',
            'Open the target file to confirm the change.',
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View actions (2)' }));
    expect(screen.getByText('Inspect the selected workspace before editing files.')).toBeInTheDocument();
    expect(screen.getByText('Open the target file to confirm the change.')).toBeInTheDocument();
  });
});
