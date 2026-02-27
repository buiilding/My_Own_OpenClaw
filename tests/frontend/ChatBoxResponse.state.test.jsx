import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import {
  ChatBoxResponse,
  emitOverlayPhase,
  resetChatBoxResponseTestState,
  setChatState,
  useChatStore,
} from './ChatBoxResponse.testUtils';

describe('ChatBoxResponse state behavior', () => {
  beforeEach(() => {
    resetChatBoxResponseTestState();
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
    emitOverlayPhase('streaming');

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

  test('renders thinking text as transparent stream while awaiting reply', async () => {
    setChatState([
      { id: 'user-1', text: 'think', sender: 'user' },
    ]);
    useChatStore.setState({
      thinkingStatus: 'step 1\nstep 2',
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant reasoning stream')).toBeInTheDocument();
    });
    expect(screen.getByText(/step 1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
  });

  test('shows compaction status stream even when overlay phase is idle', async () => {
    setChatState([]);
    useChatStore.setState({
      thinkingStatus: 'Compacting conversation history...',
      thinkingSourceEventType: 'context-compaction-started',
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant reasoning stream')).toBeInTheDocument();
    });
    expect(screen.getByText('Compacting conversation history...')).toBeInTheDocument();
    expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
  });
});
