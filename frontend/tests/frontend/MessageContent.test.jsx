/**
 * Covers message content. behavior in the frontend test suite.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import MessageContent from '../../src/renderer/features/chat/components/MessageContent';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { INVOKE_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';

jest.mock('../../src/renderer/infrastructure/markdown', () => ({
  toSanitizedMarkdownHtml: jest.fn((text) => text),
  extractTextFromHtml: jest.fn((html) => html),
  highlightSanitizedHtml: jest.fn((html) => html),
  highlightPlainTextToHtml: jest.fn((text) => text),
}));

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => {
  const actualModule = jest.requireActual('../../src/renderer/infrastructure/ipc/bridge');
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

  test('renders user materializing display attachments through AttachmentList', () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          attachments: [{
            id: 'attachment-1',
            kind: 'image',
            source: 'user_included',
            status: 'materializing',
            previewSrc: 'data:image/png;base64,inline-base64',
            contentType: 'image/png',
          }],
        }}
      />,
    );

    const image = screen.getByRole('img', { name: 'User message attachment' });
    expect(image.getAttribute('src')).toBe('data:image/png;base64,inline-base64');
  });

  test('renders pending camera display attachment placeholders', () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          attachments: [{
            id: 'attachment-camera',
            kind: 'screenshot_request',
            source: 'camera_button',
            status: 'pending_capture',
          }],
        }}
      />,
    );

    expect(screen.getByText('Screenshot pending')).toBeInTheDocument();
  });

  test('does not render legacy user screenshot aliases as primary display input', () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          screenshotUrl: 'https://cdn.example/screenshot-a.png',
          screenshot: 'inline-b',
        }}
      />,
    );

    expect(screen.queryByRole('img', { name: 'User message attachment' })).toBeNull();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('renders authenticated artifact screenshots via IPC-backed data url resolution', async () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-output',
          text: 'result',
          attachments: [{
            id: 'tool-output-1:attachment:000',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-1',
          }],
        }}
      />,
    );

    await waitFor(() => {
      const image = screen.getByRole('img', { name: 'User message attachment' });
      expect(image.getAttribute('src')).toBe('data:image/png;base64,resolved-artifact-image');
    });

    const artifactFetchCall = IpcBridge.invoke.mock.calls.find(
      ([channel]) => channel === INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE,
    );
    expect(Boolean(artifactFetchCall)).toBe(true);
    expect(artifactFetchCall[1].artifactId).toBe('artifact-1');
  });

  test('retries artifact screenshot resolution after a transient fetch failure', async () => {
    IpcBridge.invoke.mockImplementationOnce(async (channel) => {
      if (channel === INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE) {
        throw new Error('artifact service warming up');
      }
      return { success: true };
    });
    IpcBridge.invoke.mockImplementation(async (channel) => {
      if (channel === INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE) {
        return {
          success: true,
          dataUrl: 'data:image/png;base64,recovered-artifact-image',
        };
      }
      return { success: true };
    });

    const { rerender } = render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-output',
          text: 'result',
          attachments: [{
            id: 'tool-output-retry:attachment:000',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-retry-1',
          }],
        }}
      />,
    );

    await waitFor(() => {
      const artifactFetchCalls = IpcBridge.invoke.mock.calls.filter(
        ([channel]) => channel === INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE,
      );
      expect(artifactFetchCalls).toHaveLength(1);
    });
    expect(screen.queryByRole('img', { name: 'User message attachment' })).toBeNull();

    rerender(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-output',
          text: 'result',
          attachments: [{
            id: 'tool-output-retry:attachment:000',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-retry-1',
          }],
        }}
      />,
    );

    await waitFor(() => {
      const image = screen.getByRole('img', { name: 'User message attachment' });
      expect(image.getAttribute('src')).toBe('data:image/png;base64,recovered-artifact-image');
    });

    const artifactFetchCalls = IpcBridge.invoke.mock.calls.filter(
      ([channel]) => channel === INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE,
    );
    expect(artifactFetchCalls).toHaveLength(2);
  });

  test('shows the native image context menu through IPC on right click', async () => {
    render(
      <MessageContent
        message={{
          sender: 'user',
          text: 'hello',
          attachments: [{
            id: 'attachment-1',
            kind: 'image',
            source: 'user_included',
            status: 'materializing',
            previewSrc: 'data:image/png;base64,inline-base64',
            contentType: 'image/png',
          }],
        }}
      />,
    );

    const image = screen.getByRole('img', { name: 'User message attachment' });

    await act(async () => {
      fireEvent.contextMenu(image);
    });

    await waitFor(() => {
      expect(IpcBridge.invoke).toHaveBeenCalledWith(
        INVOKE_CHANNELS.SHOW_IMAGE_CONTEXT_MENU,
        { src: 'data:image/png;base64,inline-base64' },
      );
    });
  });

  test('does not render legacy tool-output screenshot aliases as primary display input', () => {
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

    expect(screen.queryByRole('img', { name: 'User message attachment' })).toBeNull();
    expect(screen.getByText('result')).toBeInTheDocument();
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

  test('tool call details button reveals SDK display text and tool details', () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-call',
          text: 'ignored tool call text',
          toolCallDisplayText: '{\n  "name": "read_file"\n}',
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
          text: 'ignored normalized view',
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
    expect(screen.queryByText('ignored normalized view')).not.toBeInTheDocument();
  });

  test('tool call display does not recover model-facing payload when display text is absent', () => {
    render(
      <MessageContent
        message={{
          sender: 'assistant',
          type: 'tool-call',
          text: 'ignored raw row text',
          modelFacingToolCall: {
            id: 'tool_3',
            name: 'search',
            arguments: { query: 'x' },
          },
        }}
      />,
    );

    expect(screen.queryByText(/"name": "search"/)).not.toBeInTheDocument();
    expect(screen.queryByText('ignored raw row text')).not.toBeInTheDocument();
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
