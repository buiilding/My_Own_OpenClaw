/**
 * Covers chat box response.state. behavior in the frontend test suite.
 */

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
  mockSend,
  resetChatBoxResponseTestState,
  setChatState,
  useChatStore,
} from './ChatBoxResponse.testUtils';
import {
  acceptPendingTurnInChatStore,
  acceptStoppedTurnInChatStore,
  clearPendingTurnInChatStore,
  setConversationViewInChatStore,
  setNoViewSdkLiveTurnInChatStore,
  setIsSendingInChatStore,
  setMessagesInChatStore,
  setThinkingStatusInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import { DesktopCurrentTurnMessageRuntime } from '../../src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';

const {
  buildLegacyNoPresentationCurrentTurnMessages,
} = DesktopCurrentTurnMessageRuntime;

describe('ChatBoxResponse state behavior', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    resetChatBoxResponseTestState();
  });

  function getActiveWorkspace() {
    return useChatStore.getState().getWorkspaceState();
  }

  function sdkPresentationProjection({
    mode,
    entries = [],
    turnRef = 'turn-sdk-transition',
    phase = mode === 'response' ? 'streaming' : 'awaiting',
  }) {
    return {
      conversationRef: 'conv-test',
      turnRef,
      phase,
      userMessageRowId: 'user-sdk-transition',
      assistantText: entries.map((entry) => entry.text || '').join(''),
      reasoningText: null,
      toolEvents: [],
      lastError: null,
      presentation: {
        conversationRef: 'conv-test',
        turnRef,
        phase,
        entries,
        hasVisibleContent: entries.length > 0,
        typingVisible: mode === 'awaiting',
        overlayVisible: mode !== 'hidden',
        isBusy: mode !== 'hidden',
        isTerminal: false,
        lastError: null,
        awaitingAnchor: mode === 'awaiting'
          ? {
            kind: 'user-message',
            rowId: 'user-sdk-transition',
            turnRef,
            conversationRef: 'conv-test',
          }
          : null,
        overlayIntent: {
          visible: mode !== 'hidden',
          mode,
          turnRef,
          conversationRef: 'conv-test',
          staleGuardRef: turnRef,
        },
      },
    };
  }

  function pendingTurn(overrides = {}) {
    return {
      conversationRef: 'conv-test',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'run command',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
      ...overrides,
    };
  }

  function conversationView({
    mode = 'response',
    entries = [],
    turnRef = 'turn-view',
    phase = mode === 'typing' ? 'awaiting' : 'streaming',
  } = {}) {
    return {
      conversationRef: 'conv-test',
      revisionId: 'rev-view',
      displayRows: [],
      liveTurn: {
        turnRef,
        phase,
        entries,
        isBusy: mode !== 'hidden',
        isTerminal: false,
        canStop: mode !== 'hidden',
      },
      surfaces: {
        pill: { mode: mode === 'hidden' ? 'idle' : 'busy' },
        dashboard: { mode: mode === 'hidden' ? 'idle' : 'busy' },
        responseOverlay: {
          mode,
          visible: mode !== 'hidden',
          guardRef: turnRef,
          ownerConversationRef: 'conv-test',
          turnRef,
        },
      },
      actions: {
        canEdit: false,
        canRetry: false,
        canFork: false,
      },
    };
  }

  test('does not show awaiting indicator from raw isSending without pending turn or SDK current turn', () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);
    useChatStore.setState({
      isSending: true,
      sdkLiveTurn: null,
    });

    render(<ChatBoxResponse />);

    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows awaiting indicator from pending turn before SDK current-turn arrives', async () => {
    render(<ChatBoxResponse />);

    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();

    act(() => {
      acceptPendingTurnInChatStore(pendingTurn());
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    expect(getActiveWorkspace().isSending).toBe(true);
    expect(getActiveWorkspace().sdkLiveTurn).toBeNull();
  });

  test('hides pending-turn awaiting indicator after pending stop is accepted', async () => {
    render(<ChatBoxResponse />);

    act(() => {
      acceptPendingTurnInChatStore(pendingTurn());
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });

    act(() => {
      acceptStoppedTurnInChatStore({
        conversationRef: 'conv-test',
        turnRef: 'turn-pending',
        stoppedAt: '2026-06-16T00:00:01.000Z',
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
    expect(getActiveWorkspace().pendingTurn).toBeNull();
    expect(getActiveWorkspace().isSending).toBe(false);
  });

  test('reports pending-turn typing size immediately', () => {
    render(<ChatBoxResponse />);

    act(() => {
      acceptPendingTurnInChatStore(pendingTurn());
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'set-responsebox-size',
      expect.objectContaining({
        visible: true,
        compact_hover: true,
        stale_guard_ref: 'renderer-send-preflight',
        turn_ref: 'turn-pending',
      }),
    );
  });

  test('keeps pending-turn awaiting visible through hidden startup SDK projection', async () => {
    render(<ChatBoxResponse />);

    act(() => {
      acceptPendingTurnInChatStore(pendingTurn());
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });

    act(() => {
      useChatStore.setState({
        sdkLiveTurn: sdkPresentationProjection({
          mode: 'hidden',
          phase: 'idle',
          turnRef: 'startup-hidden',
        }),
      });
    });

    expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();

    act(() => {
      useChatStore.setState({
        sdkLiveTurn: sdkPresentationProjection({
          mode: 'awaiting',
          turnRef: 'turn-live',
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('buildLegacyNoPresentationCurrentTurnMessages uses SDK tool-event identity fields', () => {
    const messages = buildLegacyNoPresentationCurrentTurnMessages({
      conversationRef: 'conv-test',
      turnRef: 'turn-live',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_call',
        toolName: 'read_file',
        requestId: 'req-read',
        correlationId: 'corr-read',
        text: 'Using read_file for README.md',
        modelFacingToolCall: {
          id: 'call-read',
          name: 'read_file',
          arguments: { path: 'README.md' },
        },
        toolArguments: { path: 'README.md' },
        toolCallDetails: {
          displaySource: 'sdk-tool-event',
        },
        payload: {
          toolName: 'read_file',
          requestId: 'req-read',
          correlationId: 'corr-read',
          args: { path: 'README.md' },
          structuredPayload: {
            tool_name: 'wrong_backend_tool',
            request_id: 'wrong-request',
            correlation_id: 'wrong-correlation',
            parameters: { path: 'wrong.md' },
          },
        },
      }],
    });

    const toolMessage = messages.find(message => message.type === 'tool-call');
    expect(toolMessage).toEqual(expect.objectContaining({
      correlationId: 'corr-read',
      text: 'Using read_file for README.md',
      toolCallDisplayText: 'Using read_file for README.md',
    }));
    expect(toolMessage).not.toHaveProperty('modelFacingToolCall');
    expect(toolMessage.text).not.toContain('wrong_backend_tool');
    expect(toolMessage.text).not.toContain('wrong.md');
  });

  test('buildLegacyNoPresentationCurrentTurnMessages renders SDK tool-output text', () => {
    const messages = buildLegacyNoPresentationCurrentTurnMessages({
      conversationRef: 'conv-test',
      turnRef: 'turn-live',
      phase: 'tool_output',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-1',
        kind: 'tool_output',
        toolName: 'read_file',
        requestId: 'req-read',
        correlationId: 'corr-read',
        text: 'README contents',
        toolOutputDetails: {
          output: 'README contents',
          success: true,
        },
        payload: {
          output: 'wrong output',
          structuredPayload: {
            output: 'also wrong',
            step_results: [{ tool: 'wrong_tool', output: 'wrong step' }],
          },
        },
      }],
    });

    const toolMessage = messages.find(message => message.type === 'tool-output');
    expect(toolMessage).toEqual(expect.objectContaining({
      text: 'README contents',
      correlationId: 'corr-read',
      toolOutputDetails: {
        output: 'README contents',
        success: true,
      },
    }));
    expect(toolMessage.text).not.toContain('wrong output');
    expect(toolMessage.text).not.toContain('wrong step');
  });

  test('logs when the awaiting typing indicator is actually rendered and removed', async () => {
    window.history.pushState({}, '', '/?dev_ui=1&view=minimal-response-overlay');
    act(() => {
      setMessagesInChatStore([{ id: 'user-sdk-transition', text: 'run command', sender: 'user' }]);
      setIsSendingInChatStore(true);
      setThinkingStatusInChatStore(null);
      setNoViewSdkLiveTurnInChatStore(sdkPresentationProjection({ mode: 'awaiting' }));
      setConversationViewInChatStore(null);
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith('live-surface-trace', expect.objectContaining({
        event: 'typing.rendered.show',
        view: 'minimal-response-overlay',
        source: 'minimal-response-overlay',
        reason: 'awaiting-indicator-rendered',
        turnRef: 'turn-sdk-transition',
      }));
    });

    const responseProjection = sdkPresentationProjection({
      mode: 'response',
      entries: [{
        id: 'assistant-sdk-transition',
        type: 'llm-text',
        text: 'first response',
        turnRef: 'turn-sdk-transition',
      }],
      phase: 'streaming',
    });
    act(() => {
      setMessagesInChatStore([
        { id: 'user-sdk-transition', text: 'run command', sender: 'user' },
        {
          id: 'assistant-sdk-transition',
          text: 'first response',
          sender: 'assistant',
          type: 'llm-text',
          turnRef: 'turn-sdk-transition',
        },
      ]);
      setIsSendingInChatStore(false);
      setNoViewSdkLiveTurnInChatStore(responseProjection);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith('live-surface-trace', expect.objectContaining({
        event: 'typing.rendered.hide',
        view: 'minimal-response-overlay',
        source: 'minimal-response-overlay',
        reason: 'awaiting-indicator-not-rendered',
        turnRef: 'turn-sdk-transition',
      }));
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

  test('reports pointer-scoped response overlay interactivity to main-owned hit-testing runtime', async () => {
    setChatState([
      {
        id: 'assistant-1',
        text: 'visible response',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    const { container } = render(<ChatBoxResponse />);
    emitOverlayPhase('streaming');

    await waitFor(() => {
      expect(screen.getByText('visible response')).toBeInTheDocument();
    });

    const shell = container.querySelector('.chatbox-shell');
    Object.defineProperty(shell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 170,
        height: 160,
        left: 20,
        right: 520,
        top: 10,
        width: 500,
        x: 20,
        y: 10,
      }),
    });

    mockInvoke.mockClear();

    await act(async () => {
      fireEvent.mouseMove(window, { clientX: 260, clientY: 60 });
      fireEvent.mouseMove(window, { clientX: 260, clientY: 4 });
      await Promise.resolve();
    });

    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-responsebox-hit-test-active' && payload?.active === true,
    )).toBe(true);
    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-responsebox-hit-test-active' && payload?.active === false,
    )).toBe(true);
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

  test('keeps awaiting indicator visible for pending turn when overlay phase is streaming', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);
    acceptPendingTurnInChatStore(pendingTurn({
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'run command',
    }));

    render(<ChatBoxResponse />);
    emitOverlayPhase('streaming');

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('does not show awaiting indicator for phase-only tool-output projection', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);
    emitOverlayPhase('tool-output');

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
        text: 'Click the submit button',
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
    expect(screen.getByText(/Click the submit button/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows explanation-only overlay before the first llm-text arrives', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'tool-call-1',
        text: 'Open the Settings app',
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
      expect(screen.getByText(/Open the Settings app/)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows direct tool explanation-only overlay before the first llm-text arrives', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'tool-call-1',
        text: 'Verify the currently focused workspace',
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
      expect(screen.getByText(/Verify the currently focused workspace/)).toBeInTheDocument();
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
        sourceChannel: 'sdk:conversation-event',
      },
      {
        id: 'search-2',
        text: 'Searched ncbi.nlm.nih.gov',
        sender: 'assistant',
        type: 'search-source',
        sourceEventType: 'web-search-progress',
        sourceChannel: 'sdk:conversation-event',
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

  test('renders assistant text through the shared markdown message component', async () => {
    setChatState([
      { id: 'user-1', text: 'question', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'shared **markdown**',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
      },
    ]);

    const { container } = render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('shared **markdown**')).toBeInTheDocument();
    });

    expect(container.querySelector('.message-content-markdown')).not.toBeNull();
    expect(container.querySelector('.chatbox-response-markdown')).toBeNull();
  });

  test('keeps awaiting indicator stable while store thinking text exists', async () => {
    setChatState([
      { id: 'user-1', text: 'think', sender: 'user' },
    ]);
    acceptPendingTurnInChatStore(pendingTurn({
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'think',
    }));
    useChatStore.setState({
      thinkingStatus: 'step 1\nstep 2',
    });

    const { container } = render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant reasoning stream')).not.toBeInTheDocument();
    expect(container.querySelector('.chatbox-awaiting-shell')).toHaveAttribute(
      'data-thinking',
      '0',
    );
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

  test('clears awaiting indicator on idle and only re-shows it for renderer pending', async () => {
    setChatState([]);
    render(<ChatBoxResponse />);

    act(() => {
      acceptPendingTurnInChatStore(pendingTurn());
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });

    act(() => {
      clearPendingTurnInChatStore({
        conversationRef: 'conv-test',
        turnRef: 'turn-pending',
      });
    });
    emitOverlayPhase('idle');
    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });

    emitOverlayPhase('streaming');
    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
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
    acceptPendingTurnInChatStore(pendingTurn({
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'run command',
    }));

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

  test('does not send a hide size update during SDK awaiting-to-response transition', async () => {
    const awaitingProjection = sdkPresentationProjection({
      mode: 'awaiting',
    });
    useChatStore.setState({
      messages: [
        { id: 'user-sdk-transition', text: 'yo', sender: 'user' },
      ],
      isSending: false,
      sdkLiveTurn: awaitingProjection,
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'set-responsebox-size',
        expect.objectContaining({
          visible: true,
          compact_hover: true,
          stale_guard_ref: 'turn-sdk-transition',
        }),
      );
    });

    mockInvoke.mockClear();

    const responseProjection = sdkPresentationProjection({
      mode: 'response',
      phase: 'streaming',
      entries: [{
        id: 'entry-sdk-transition',
        type: 'llm-text',
        text: 'response token',
        sourceEventType: 'assistant_delta',
        turnRef: 'turn-sdk-transition',
      }],
    });
    act(() => {
      useChatStore.setState({
        sdkLiveTurn: responseProjection,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('response token')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'set-responsebox-size',
        expect.objectContaining({
          visible: true,
          compact_hover: false,
          stale_guard_ref: 'turn-sdk-transition',
        }),
      );
    });
    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => (
        channel === 'set-responsebox-size'
        && payload?.visible === false
        && payload?.stale_guard_ref === 'turn-sdk-transition'
      ),
    )).toBe(false);
  });

  test('new local send hides the previous response and shows awaiting until SDK streaming starts', async () => {
    setChatState([
      { id: 'user-1', text: 'hello', sender: 'user', type: 'user', turnRef: 'turn-1' },
      {
        id: 'assistant-1',
        text: 'previous complete response',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
        turnRef: 'turn-1',
      },
    ]);
    useChatStore.setState({
      sdkLiveTurn: {
        conversationRef: 'conv-test',
        turnRef: 'turn-1',
        phase: 'complete',
        assistantText: 'previous complete response',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('previous complete response')).toBeInTheDocument();
    });

    act(() => {
      acceptPendingTurnInChatStore(pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'again',
      }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    expect(screen.queryByText('previous complete response')).not.toBeInTheDocument();

    act(() => {
      useChatStore.setState({
        isSending: false,
        sdkLiveTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-2',
          phase: 'streaming',
          assistantText: 'new streaming response',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
          presentation: {
            conversationRef: 'conv-test',
            turnRef: 'turn-2',
            phase: 'streaming',
            entries: [{
              id: 'entry-new-streaming-response',
              type: 'llm-text',
              text: 'new streaming response',
              sourceEventType: 'assistant_delta',
              turnRef: 'turn-2',
            }],
            isBusy: true,
            isTerminal: false,
            lastError: null,
            awaitingAnchor: null,
            overlayIntent: {
              visible: true,
              mode: 'response',
              turnRef: 'turn-2',
              conversationRef: 'conv-test',
              staleGuardRef: 'turn-2',
            },
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('new streaming response')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('new local send reports preflight guard instead of previous response guard', async () => {
    const previousProjection = sdkPresentationProjection({
      mode: 'response',
      phase: 'complete',
      turnRef: 'turn-1',
      entries: [{
        id: 'entry-previous-response',
        type: 'llm-text',
        text: 'previous complete response',
        sourceEventType: 'assistant_message_full',
        turnRef: 'turn-1',
      }],
    });
    useChatStore.setState({
      messages: [
        { id: 'user-1', text: 'hello', sender: 'user', type: 'user', turnRef: 'turn-1' },
        {
          id: 'assistant-1',
          text: 'previous complete response',
          sender: 'assistant',
          type: 'llm-text',
          isComplete: true,
          turnRef: 'turn-1',
        },
      ],
      isSending: false,
      sdkLiveTurn: previousProjection,
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('previous complete response')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'set-responsebox-size',
        expect.objectContaining({
          visible: true,
          stale_guard_ref: 'turn-1',
        }),
      );
    });

    mockInvoke.mockClear();
    act(() => {
      acceptPendingTurnInChatStore(pendingTurn({
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'again',
      }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
    expect(screen.queryByText('previous complete response')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'set-responsebox-size',
        expect.objectContaining({
          visible: true,
          compact_hover: true,
          stale_guard_ref: 'renderer-send-preflight',
          turn_ref: 'turn-2',
        }),
      );
    });
    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => (
        channel === 'set-responsebox-size'
        && payload?.visible === true
        && payload?.stale_guard_ref === 'turn-1'
      ),
    )).toBe(false);
  });

  test('stale raw isSending alone does not hide previous response before pending turn lands', async () => {
    setChatState([
      { id: 'user-1', text: 'hello', sender: 'user', type: 'user', turnRef: 'turn-1' },
      {
        id: 'assistant-1',
        text: 'previous complete response',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: true,
        turnRef: 'turn-1',
      },
    ]);
    useChatStore.setState({
      isSending: true,
      sdkLiveTurn: {
        conversationRef: 'conv-test',
        turnRef: 'turn-1',
        phase: 'complete',
        assistantText: 'previous complete response',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('previous complete response')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('renders response entries from conversation view over stale awaiting projection', async () => {
    const awaitingProjection = sdkPresentationProjection({
      mode: 'awaiting',
      turnRef: 'turn-view',
    });
    const view = conversationView({
      mode: 'response',
      turnRef: 'turn-view',
      entries: [{
        id: 'entry-view-response',
        sender: 'assistant',
        type: 'llm-text',
        text: 'view-authoritative response',
        sourceEventType: 'assistant_delta',
        sourceChannel: 'sdk:conversation-view',
        turnRef: 'turn-view',
      }],
    });
    useChatStore.setState({
      messages: [
        { id: 'user-view', text: 'yo', sender: 'user', turnRef: 'turn-view' },
      ],
      isSending: false,
      sdkLiveTurn: awaitingProjection,
      conversationView: view,
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('view-authoritative response')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'set-responsebox-size',
        expect.objectContaining({
          visible: true,
          compact_hover: false,
          stale_guard_ref: 'turn-view',
        }),
      );
    });
  });

  test('SDK presentation response bypasses local send latch and synthetic message fallback', async () => {
    setChatState([
      {
        id: 'assistant-fallback',
        text: 'synthetic fallback response',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
        turnRef: 'turn-sdk',
      },
    ]);
    useChatStore.setState({
      isSending: true,
      sdkLiveTurn: {
        conversationRef: 'conv-test',
        turnRef: 'turn-sdk',
        phase: 'streaming',
        assistantText: '',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
        presentation: {
          conversationRef: 'conv-test',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          entries: [
            {
              id: 'conv-test:turn-sdk:assistant',
              type: 'llm-text',
              text: 'sdk presentation response',
              sourceEventType: 'assistant_delta',
              sourceChannel: 'sdk:current-turn',
              turnRef: 'turn-sdk',
            },
          ],
          hasVisibleContent: true,
          typingVisible: false,
          overlayVisible: true,
          isBusy: true,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-sdk',
            conversationRef: 'conv-test',
            staleGuardRef: 'turn-sdk',
          },
        },
      },
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('sdk presentation response')).toBeInTheDocument();
    });
    expect(screen.queryByText('synthetic fallback response')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('does not fall back to projection response when SDK presentation entries are empty', async () => {
    setChatState([
      { id: 'user-1', text: 'hello', sender: 'user', type: 'user', turnRef: 'turn-sdk' },
    ]);
    useChatStore.setState({
      isSending: false,
      sdkLiveTurn: {
        conversationRef: 'conv-test',
        turnRef: 'turn-sdk',
        phase: 'streaming',
        assistantText: 'projection visible response',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
        presentation: {
          conversationRef: 'conv-test',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          entries: [],
          hasVisibleContent: false,
          typingVisible: false,
          overlayVisible: false,
          isBusy: false,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: false,
            mode: 'hidden',
            turnRef: 'turn-sdk',
            conversationRef: 'conv-test',
            staleGuardRef: 'turn-sdk',
          },
        },
      },
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.queryByText('projection visible response')).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('sends hide size update when visible response overlay unmounts', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'visible response',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    const { unmount } = render(<ChatBoxResponse />);
    emitOverlayPhase('streaming');

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'set-responsebox-size',
        expect.objectContaining({ visible: true }),
      );
    });

    act(() => {
      unmount();
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'set-responsebox-size',
        expect.objectContaining({
          visible: false,
          width: 0,
          height: 0,
          turn_ref: 'turn-test',
          stale_guard_ref: 'turn-test',
        }),
      );
    });
  });

});
