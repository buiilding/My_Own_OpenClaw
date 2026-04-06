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
    useChatStore.setState({
      isSending: true,
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('shows response overlay even when assistant text arrives before local user anchor', async () => {
    setChatState([
      {
        id: 'assistant-early',
        text: 'first response',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('streaming');

    await waitFor(() => {
      expect(screen.getByText('first response')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('keeps response overlay visible during tool phases after the first assistant chunk arrives', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);
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
    expect(screen.getByText('first chunk')).toBeInTheDocument();

    emitOverlayPhase('tool-output');
    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
    expect(screen.getByText('first chunk')).toBeInTheDocument();
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

  test('renders tool explanations as persistent transcript lines', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'partial answer',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
      {
        id: 'tool-call-1',
        text: '{\n  "name": "click"\n}',
        sender: 'assistant',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          tool_name: 'click',
          parameters: {
            explanation: 'Click the submit button',
          },
        },
      },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('tool-output');

    await waitFor(() => {
      expect(screen.getByText('partial answer')).toBeInTheDocument();
    });
    expect(screen.getByText('Click the submit button')).toBeInTheDocument();
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows explanation-only overlay before the first llm-text arrives', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'tool-call-1',
        text: '{\n  "name": "open_app"\n}',
        sender: 'assistant',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        modelFacingToolCall: {
          name: 'open_app',
          arguments: {
            explanation: 'Open the Settings app',
          },
        },
      },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('tool-call');

    await waitFor(() => {
      expect(screen.getByText('Open the Settings app')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows direct tool explanation-only overlay before the first llm-text arrives', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'tool-call-1',
        text: '{\n  "name": "run_shell_command"\n}',
        sender: 'assistant',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        modelFacingToolCall: {
          name: 'run_shell_command',
          arguments: {
            command: 'pwd',
            run_in_background: false,
            explanation: 'Verify the currently focused workspace',
          },
        },
      },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('tool-call');

    await waitFor(() => {
      expect(screen.getByText('Verify the currently focused workspace')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows live web-search progress rows before the first llm-text arrives', async () => {
    setChatState([
      { id: 'user-1', text: 'search for this', sender: 'user' },
      {
        id: 'search-1',
        text: 'Searched youtube.com',
        sender: 'assistant',
        type: 'search-source',
        sourceEventType: 'web-search-progress',
        sourceChannel: 'from-backend',
      },
      {
        id: 'search-2',
        text: 'Searched ncbi.nlm.nih.gov',
        sender: 'assistant',
        type: 'search-source',
        sourceEventType: 'web-search-progress',
        sourceChannel: 'from-backend',
      },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('tool-call');

    await waitFor(() => {
      expect(screen.getByText('Searched youtube.com')).toBeInTheDocument();
    });
    expect(screen.getByText('Searched ncbi.nlm.nih.gov')).toBeInTheDocument();
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
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

  test('keeps response pane at a fixed height while content streams', async () => {
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
    expect(responsePane).toBeTruthy();
    expect(responsePane.style.height).toBe('236px');

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
      expect(responsePane.style.height).toBe('236px');
    });
  });

  test('keeps awaiting indicator stable while thinking text exists', async () => {
    setChatState([
      { id: 'user-1', text: 'think', sender: 'user' },
    ]);
    useChatStore.setState({
      isSending: true,
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

  test('clears awaiting indicator on idle and only re-shows it for a live phase', async () => {
    setChatState([]);
    render(<ChatBoxResponse />);

    emitOverlayPhase('tool-output');
    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });

    emitOverlayPhase('idle');
    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });

    emitOverlayPhase('streaming');
    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('keeps the current-turn response transcript visible while tool-output is active', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('previous complete response')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('keeps the response transcript visible after visibility restore during tool phases', async () => {
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
      expect(screen.getByText('before tool')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();

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
      expect(screen.getByText('before tool + first token')).toBeInTheDocument();
    });
  });

  test('re-reports compact overlay size after visibility hide/show cycle', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);
    useChatStore.setState({
      isSending: true,
    });

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
