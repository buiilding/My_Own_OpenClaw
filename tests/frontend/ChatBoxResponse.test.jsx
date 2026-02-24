import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import ChatBoxResponse from '../../frontend/src/renderer/features/chat/components/ChatBoxResponse';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';

const mockInvoke = jest.fn().mockResolvedValue({ success: true });
const mockListeners = new Map();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    on: (channel, handler) => {
      mockListeners.set(channel, handler);
      return () => mockListeners.delete(channel);
    },
  },
  INVOKE_CHANNELS: {
    SET_RESPONSEBOX_SIZE: 'set-responsebox-size',
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/markdown', () => ({
  toSanitizedMarkdownHtml: (text) => `<p>${text || ''}</p>`,
}));

function setChatState(messages) {
  useChatStore.setState({
    messages,
    isSending: false,
    thinkingStatus: null,
  });
}

describe('ChatBoxResponse', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockListeners.clear();
    setChatState([]);
  });

  test('shows tool-call response immediately when tool-call arrives before llm-text', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      { id: 'tool-1', text: 'tool-call payload', sender: 'assistant', type: 'tool-call' },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('tool-call payload')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows awaiting indicator when no assistant response exists yet', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('hides awaiting indicator after overlay phase moves to streaming', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);

    const onPhase = mockListeners.get('response-overlay-phase');
    expect(onPhase).toEqual(expect.any(Function));

    act(() => {
      onPhase({ phase: 'streaming' });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
  });

  test('incomplete llm response is visible but not closeable', async () => {
    setChatState([
      { id: 'user-1', text: 'question', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'partial answer',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('partial answer')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', {
      name: 'Response still streaming',
    });
    expect(closeButton).toBeDisabled();
  });

  test('error response can be closed and stays dismissed', async () => {
    setChatState([
      { id: 'user-1', text: 'question', sender: 'user' },
      {
        id: 'assistant-err',
        text: 'something failed',
        sender: 'assistant',
        type: 'error',
        isComplete: true,
      },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('something failed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close response' }));

    await waitFor(() => {
      expect(screen.queryByText('something failed')).not.toBeInTheDocument();
    });
  });

  test('shows top overflow indicator when response pane is scrolled above bottom', async () => {
    setChatState([
      { id: 'user-1', text: 'question', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'line 1\nline 2\nline 3\nline 4\nline 5',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    const { container } = render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText(/line 1/)).toBeInTheDocument();
    });

    const responsePane = container.querySelector('.chatbox-response-pill');
    expect(responsePane).toBeTruthy();

    Object.defineProperty(responsePane, 'scrollHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(responsePane, 'clientHeight', {
      value: 180,
      configurable: true,
    });
    Object.defineProperty(responsePane, 'scrollTop', {
      value: 120,
      writable: true,
      configurable: true,
    });

    fireEvent.scroll(responsePane);

    await waitFor(() => {
      expect(responsePane.classList.contains('has-overflow-above')).toBe(true);
    });
  });
});
