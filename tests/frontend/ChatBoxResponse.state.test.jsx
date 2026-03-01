import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import {
  ChatBoxResponse,
  emitOverlayPhase,
  emitOverlayVisibility,
  mockInvoke,
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

  test('hides awaiting indicator after first assistant chunk arrives during streaming', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('tool-output');
    emitOverlayPhase('streaming');
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', text: 'run command', sender: 'user' },
          {
            id: 'assistant-1',
            text: 'first chunk',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
          },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
  });

  test('keeps awaiting indicator visible when query is sending and overlay phase is streaming', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);
    useChatStore.setState({
      isSending: true,
    });

    render(<ChatBoxResponse />);
    emitOverlayPhase('streaming');

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('keeps awaiting indicator during tool-output and clears on terminal overlay phase', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('tool-output');

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });

    emitOverlayPhase('complete');
    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
  });

  test('shows awaiting indicator for tool-output phase after response is dismissed', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'partial answer',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('partial answer')).toBeInTheDocument();
    });

    emitOverlayPhase('streaming');
    fireEvent.click(screen.getByRole('button', { name: 'Close response' }));

    await waitFor(() => {
      expect(screen.queryByText('partial answer')).not.toBeInTheDocument();
    });

    emitOverlayPhase('tool-output');

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
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

  test('snaps response pane height to deterministic fixed steps', async () => {
    const userMessage = { id: 'user-1', text: 'question', sender: 'user' };
    const assistantMessage = {
      id: 'assistant-1',
      text: 'short response',
      sender: 'assistant',
      type: 'llm-text',
      isComplete: false,
    };
    setChatState([userMessage, assistantMessage]);

    const { container } = render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('short response')).toBeInTheDocument();
    });

    const responsePane = container.querySelector('.chatbox-response-pill');
    const responseBody = container.querySelector('.chatbox-response-body');
    expect(responsePane).toBeTruthy();
    expect(responseBody).toBeTruthy();

    let mockScrollHeight = 90;
    Object.defineProperty(responseBody, 'scrollHeight', {
      configurable: true,
      get: () => mockScrollHeight,
    });

    act(() => {
      useChatStore.setState({
        messages: [
          userMessage,
          {
            ...assistantMessage,
            text: 'step one',
          },
        ],
      });
    });

    await waitFor(() => {
      expect(responsePane.style.height).toBe('164px');
    });

    mockScrollHeight = 215;
    act(() => {
      useChatStore.setState({
        messages: [
          userMessage,
          {
            ...assistantMessage,
            text: 'step two',
          },
        ],
      });
    });

    await waitFor(() => {
      expect(responsePane.style.height).toBe('324px');
    });

    mockScrollHeight = 700;
    act(() => {
      useChatStore.setState({
        messages: [
          userMessage,
          {
            ...assistantMessage,
            text: 'step three',
          },
        ],
      });
    });

    await waitFor(() => {
      expect(responsePane.style.height).toBe('460px');
    });
  });

  test('keeps awaiting indicator stable while thinking text exists', async () => {
    setChatState([
      { id: 'user-1', text: 'think', sender: 'user' },
    ]);
    useChatStore.setState({
      thinkingStatus: 'step 1\nstep 2',
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant reasoning stream')).not.toBeInTheDocument();
  });

  test('does not show reasoning stream when compaction status arrives without awaiting phase', async () => {
    setChatState([]);
    useChatStore.setState({
      thinkingStatus: 'Compacting conversation history...',
      thinkingSourceEventType: 'context-compaction-started',
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant reasoning stream')).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('keeps overlay awaiting indicator latched through idle gap until first chunk arrives', async () => {
    setChatState([]);
    render(<ChatBoxResponse />);

    emitOverlayPhase('tool-output');
    emitOverlayPhase('idle');

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });

    emitOverlayPhase('streaming');
    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('hides stale completed response while awaiting lock is active', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'assistant-prev',
        text: 'previous complete response',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('previous complete response')).toBeInTheDocument();
    });

    emitOverlayPhase('tool-output');
    emitOverlayPhase('idle');

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    expect(screen.queryByText('previous complete response')).not.toBeInTheDocument();
  });

  test('keeps stale response hidden after visibility restore and unlocks on same-id token update', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'before tool',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('before tool')).toBeInTheDocument();
    });

    emitOverlayPhase('tool-output');
    emitOverlayVisibility(false);
    emitOverlayVisibility(true);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    expect(screen.queryByText('before tool')).not.toBeInTheDocument();

    emitOverlayPhase('streaming');
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', text: 'run command', sender: 'user' },
          {
            id: 'assistant-1',
            text: 'before tool + first token',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
          },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
    expect(screen.getByText('before tool + first token')).toBeInTheDocument();
  });

  test('re-reports compact overlay size after visibility hide/show cycle', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });

    const initialVisibleReports = mockInvoke.mock.calls.filter(
      ([channel, payload]) => channel === 'set-responsebox-size' && payload?.visible === true,
    ).length;

    emitOverlayVisibility(false);
    emitOverlayVisibility(true);

    await waitFor(() => {
      const visibleReports = mockInvoke.mock.calls.filter(
        ([channel, payload]) => channel === 'set-responsebox-size' && payload?.visible === true,
      );
      expect(visibleReports.length).toBeGreaterThan(initialVisibleReports);
      expect(visibleReports[visibleReports.length - 1][1]).toEqual(expect.objectContaining({
        visible: true,
        compact_hover: true,
      }));
    });
  });

});
