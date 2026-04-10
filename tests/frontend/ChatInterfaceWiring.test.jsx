import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import ChatInterface from '../../frontend/src/renderer/features/chat/components/ChatInterface';
const { selectMockStoreState: mockSelectStoreState } = require('./storeSelectorTestUtils.cjs');

const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: jest.fn(),
}));
let mockConfig = {
  interaction_mode: 'chat',
  speech_mode_enabled: false,
  show_tool_logs: false,
  model_provider: 'openai',
  selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
};
let mockAvailableModels = {
  local: [],
  online: [],
};
const mockUpdateConfig = jest.fn();
const mockMessageInput = jest.fn(() => <div data-testid="message-input" />);

const mockPlayerService = {
  cleanup: jest.fn(),
  enqueueAudio: jest.fn(),
  stopPlayback: jest.fn(),
};
const mockStopQuery = jest.fn();
const mockCompactHistory = jest.fn();
const mockSendQuery = jest.fn();
const mockSendRehydrateConversation = jest.fn();
const mockUpdateSettings = jest.fn();
const mockEnsureConversationInferenceSessionHydrated = jest.fn();
const mockRehydrateConversationInferenceSession = jest.fn();
const mockIsDevUiEnabled = jest.fn(() => false);
const mockClearMessages = jest.fn();
const mockSetMessages = jest.fn();
const mockUpdateMessage = jest.fn();
const mockSetIsSending = jest.fn();
const mockSetThinkingStatus = jest.fn();
const mockSetThinkingSourceEventType = jest.fn();
const mockSetTokenCounts = jest.fn();
const mockUpdateStreamTracking = jest.fn();
const mockSetChatActiveConversationRef = jest.fn();
const mockSetActiveConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();
const mockGetActiveConversationRef = jest.fn(() => 'conv_existing');
const mockGetTranscriptSessionInfo = jest.fn(() => ({
  conversationRef: 'conv_existing',
  userId: 'default_user',
}));
const mockIpcInvoke = jest.fn(async () => ({ success: true }));
const mockIpcListeners = new Map();
const mockMessageList = jest.fn(() => <div data-testid="message-list" />);
let mockTranscriptSessionSnapshot = {
  conversationRef: 'conv_existing',
  userId: 'default_user',
};
const mockChatState = {
  messages: [],
  isSending: false,
  thinkingStatus: null,
  thinkingSourceEventType: null,
  tokenCounts: null,
  streamTracking: { phase: 'idle' },
  clearMessages: (...args) => mockClearMessages(...args),
  setMessages: (...args) => mockSetMessages(...args),
  updateMessage: (...args) => mockUpdateMessage(...args),
  setIsSending: (...args) => mockSetIsSending(...args),
  setThinkingStatus: (...args) => mockSetThinkingStatus(...args),
  setThinkingSourceEventType: (...args) => mockSetThinkingSourceEventType(...args),
  setTokenCounts: (...args) => mockSetTokenCounts(...args),
  updateStreamTracking: (...args) => mockUpdateStreamTracking(...args),
  setActiveConversationRef: (...args) => mockSetChatActiveConversationRef(...args),
};

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: (...args) => mockUseChatMessageSender(...args),
}));

jest.mock('../../frontend/src/renderer/features/chat/stores/chatStore', () => ({
  useChatStore: (selector) => mockSelectStoreState(selector, mockChatState),
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: mockConfig,
    availableModels: mockAvailableModels,
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../frontend/src/renderer/infrastructure/audio/PlayerService', () => ({
  PlayerService: jest.fn(() => mockPlayerService),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    stopQuery: (...args) => mockStopQuery(...args),
    compactHistory: (...args) => mockCompactHistory(...args),
    sendQuery: (...args) => mockSendQuery(...args),
    sendRehydrateConversation: (...args) => mockSendRehydrateConversation(...args),
    updateSettings: (...args) => mockUpdateSettings(...args),
  },
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime', () => ({
  ensureConversationInferenceSessionHydrated: (...args) => mockEnsureConversationInferenceSessionHydrated(...args),
  rehydrateConversationInferenceSession: (...args) => mockRehydrateConversationInferenceSession(...args),
  markConversationInferenceSessionLocalOnly: jest.fn(),
  markConversationInferenceSessionUnknown: jest.fn(),
  clearConversationInferenceSessionState: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/features/chat/utils/devUiFlag', () => ({
  isDevUiEnabled: () => mockIsDevUiEnabled(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
  updateTranscriptSession: (...args) => mockUpdateTranscriptSession(...args),
  getActiveConversationRef: (...args) => mockGetActiveConversationRef(...args),
  getTranscriptSessionInfo: (...args) => mockGetTranscriptSessionInfo(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (channel, listener) => {
      mockIpcListeners.set(channel, listener);
      return () => {
        mockIpcListeners.delete(channel);
      };
    },
    invoke: (...args) => mockIpcInvoke(...args),
  },
  INVOKE_CHANNELS: {
    EXECUTE_TOOL: 'execute-tool',
    GET_CONVERSATION: 'get-conversation',
    DELETE_CONVERSATION: 'delete-conversation',
    STORE_TRANSCRIPT: 'store-transcript',
    CHECK_PERMISSION: 'check-permission',
    REQUEST_PERMISSION: 'request-permission',
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    WINDOW_CLOSE: 'window-close',
  },
  ON_CHANNELS: {
    FROM_BACKEND: 'from-backend',
    IPC_STATUS: 'ipc-status',
    WORKSPACE_ACCESS_UPDATED: 'workspace-access-updated',
  },
}));

jest.mock('../../frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo', () => ({
  useTranscriptSessionInfo: () => mockTranscriptSessionSnapshot,
}));

jest.mock('../../frontend/src/renderer/features/chat/utils/backendAudioEvents', () => ({
  extractAudioChunkPayload: () => null,
}));

jest.mock('../../frontend/src/renderer/features/chat/components/MessageList', () => (props) =>
  mockMessageList(props),
);

jest.mock('../../frontend/src/renderer/features/chat/components/MessageInput', () => (props) =>
  mockMessageInput(props),
);

jest.mock('../../frontend/src/renderer/features/chat/components/ChatBrowserSessionControl', () => () => (
  <div data-testid="chat-browser-session-control" />
));

describe('ChatInterface wiring', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    mockConfig = {
      interaction_mode: 'chat',
      speech_mode_enabled: false,
      show_tool_logs: false,
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
    };
    mockAvailableModels = {
      local: [],
      online: [],
    };
    mockMessageInput.mockClear();
    mockUseChatMessageSender.mockClear();
    mockPlayerService.cleanup.mockClear();
    mockPlayerService.enqueueAudio.mockClear();
    mockPlayerService.stopPlayback.mockClear();
    mockStopQuery.mockClear();
    mockCompactHistory.mockClear();
    mockSendQuery.mockClear();
    mockSendRehydrateConversation.mockClear();
    mockUpdateSettings.mockClear();
    mockEnsureConversationInferenceSessionHydrated.mockReset();
    mockEnsureConversationInferenceSessionHydrated.mockResolvedValue(undefined);
    mockRehydrateConversationInferenceSession.mockReset();
    mockRehydrateConversationInferenceSession.mockResolvedValue(undefined);
    mockClearMessages.mockClear();
    mockSetMessages.mockClear();
    mockUpdateMessage.mockClear();
    mockSetIsSending.mockClear();
    mockSetThinkingStatus.mockClear();
    mockSetThinkingSourceEventType.mockClear();
    mockSetTokenCounts.mockClear();
    mockUpdateStreamTracking.mockClear();
    mockSetChatActiveConversationRef.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockUpdateTranscriptSession.mockClear();
    mockGetActiveConversationRef.mockClear();
    mockGetActiveConversationRef.mockImplementation(() => 'conv_existing');
    mockGetTranscriptSessionInfo.mockClear();
    mockGetTranscriptSessionInfo.mockImplementation(() => ({
      conversationRef: 'conv_existing',
      userId: 'default_user',
    }));
    mockIpcInvoke.mockClear();
    mockIpcInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: false,
              details: {
                selected_paths: [],
              },
            },
          },
        };
      }
      return { success: true };
    });
    mockIpcListeners.clear();
    mockMessageList.mockClear();
    mockUpdateConfig.mockClear();
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
    mockTranscriptSessionSnapshot = {
      conversationRef: 'conv_existing',
      userId: 'default_user',
    };
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.messages = [];
    mockChatState.isSending = false;
    mockChatState.thinkingStatus = null;
    mockChatState.thinkingSourceEventType = null;
  });

  test('uses main-window sender surface for centralized send behavior', () => {
    render(<ChatInterface />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(
      expect.any(Function),
      { senderSurface: 'main-window' },
    );
  });

  test('does not clear active conversation mapping when transcript session conversation is temporarily null', () => {
    mockTranscriptSessionSnapshot = {
      conversationRef: null,
      userId: 'default_user',
    };

    render(<ChatInterface />);

    expect(mockSetChatActiveConversationRef).not.toHaveBeenCalledWith(null);
  });

  test('replaces tool call and output rows with a collapsed actions summary when tool logs are hidden', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'run_shell_command',
            explanation: 'List the active workspace contents.',
          },
        },
      },
      {
        id: 'tool-output-1',
        sender: 'assistant',
        text: 'raw output',
        type: 'tool-output',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'The workspace contains src and tests.',
        type: 'llm-text',
        isComplete: true,
      },
    ];

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-actions-summary',
      'llm-text',
    ]);
    expect(renderedMessages[1].actionExplanations).toEqual([
      'List the active workspace contents.',
    ]);
  });

  test('shows live tool explanation rows while the active loop is still running', () => {
    mockChatState.isSending = true;
    mockChatState.streamTracking.phase = 'tool-output';
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Open a folder' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'filesystem_workspace_access',
            explanation: 'Check the selected workspace before reading files.',
          },
        },
      },
    ];

    render(<ChatInterface />);

    const lastCall = mockMessageList.mock.calls.at(-1)[0];
    expect(lastCall.awaitingDotTargetMessageId).toBeNull();
    expect(lastCall.messages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-explanation',
    ]);
    expect(lastCall.messages[1].text).toBe('Check the selected workspace before reading files.');
  });

  test('keeps live tool explanation rows visible until the assistant reply is complete', () => {
    mockChatState.streamTracking.phase = 'complete';
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'read_file',
            explanation: 'Read the selected workspace entry before summarizing it.',
          },
        },
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'I’ve explored the selected file and I’m summarizing it now.',
        type: 'llm-text',
        isComplete: false,
      },
    ];

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-explanation',
      'llm-text',
    ]);
    expect(renderedMessages[1].text).toBe('Read the selected workspace entry before summarizing it.');
  });

  test('passes raw tool rows through when tool logs are enabled', () => {
    mockConfig = {
      ...mockConfig,
      show_tool_logs: true,
    };
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      { id: 'tool-call-1', sender: 'assistant', text: 'raw tool call', type: 'tool-call' },
      { id: 'tool-output-1', sender: 'assistant', text: 'raw output', type: 'tool-output' },
    ];

    render(<ChatInterface />);

    const renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'tool-output',
    ]);
  });

  test('reapplies the hidden-tool presentation when the toggle flips on and off for existing transcript rows', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Inspect workspace' },
      {
        id: 'tool-call-1',
        sender: 'assistant',
        text: 'raw tool call',
        type: 'tool-call',
        sourceEventType: 'tool-call',
        toolCallDetails: {
          parameters: {
            tool: 'run_shell_command',
            explanation: 'List the active workspace contents.',
          },
        },
      },
      {
        id: 'tool-output-1',
        sender: 'assistant',
        text: 'raw output',
        type: 'tool-output',
      },
      {
        id: 'assistant-1',
        sender: 'assistant',
        text: 'The workspace contains src and tests.',
        type: 'llm-text',
        isComplete: true,
      },
    ];

    const { rerender } = render(<ChatInterface />);

    let renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-actions-summary',
      'llm-text',
    ]);

    mockConfig = {
      ...mockConfig,
      show_tool_logs: true,
    };
    rerender(<ChatInterface />);

    renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-call',
      'tool-output',
      'llm-text',
    ]);

    mockConfig = {
      ...mockConfig,
      show_tool_logs: false,
    };
    rerender(<ChatInterface />);

    renderedMessages = mockMessageList.mock.calls.at(-1)[0].messages;
    expect(renderedMessages.map((message) => message.type || 'llm-text')).toEqual([
      'llm-text',
      'tool-actions-summary',
      'llm-text',
    ]);
    expect(renderedMessages[1].actionExplanations).toEqual([
      'List the active workspace contents.',
    ]);
  });

  test('shows text-to-speech toggle in header', () => {
    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Toggle text-to-speech' })).toBeInTheDocument();
  });

  test('shows the active workspace name next to the text-to-speech toggle', async () => {
    mockIpcInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: true,
              details: {
                selected_paths: ['/Users/peterbui/Projects/WindieOS'],
              },
            },
          },
        };
      }
      return { success: true };
    });

    render(<ChatInterface />);

    expect(await screen.findByRole('button', { name: 'Change active workspace from WindieOS' })).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('WindieOS')).toBeInTheDocument();
  });

  test('updates the active workspace badge when the main process broadcasts a workspace change', async () => {
    render(<ChatInterface />);

    await waitFor(() => {
      expect(mockIpcListeners.has('workspace-access-updated')).toBe(true);
    });

    act(() => {
      mockIpcListeners.get('workspace-access-updated')?.({
        granted: true,
        workspaceName: 'client-demo',
        workspacePath: '/Users/peterbui/client-demo',
      });
    });

    expect(await screen.findByRole('button', { name: 'Change active workspace from client-demo' })).toBeInTheDocument();
  });

  test('workspace button requests a new workspace selection', async () => {
    mockIpcInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: false,
              details: {
                selected_paths: [],
              },
            },
          },
        };
      }
      if (channel === 'request-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: true,
              details: {
                selected_paths: ['D:\\Assistants\\WindieOS_workspace\\windieos'],
              },
            },
          },
        };
      }
      return { success: true };
    });

    render(<ChatInterface />);

    fireEvent.click(await screen.findByRole('button', { name: 'Set active workspace' }));

    await waitFor(() => {
      expect(mockIpcInvoke).toHaveBeenCalledWith('request-permission', {
        permissionId: 'filesystem_workspace_access',
      });
    });
    expect(
      await screen.findByRole('button', { name: 'Change active workspace from windieos' }),
    ).toBeInTheDocument();
  });

  test('window controls invoke minimize, maximize, and close IPC channels', () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle maximize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

    expect(mockIpcInvoke).toHaveBeenCalledWith('window-minimize', undefined);
    expect(mockIpcInvoke).toHaveBeenCalledWith('window-toggle-maximize', undefined);
    expect(mockIpcInvoke).toHaveBeenCalledWith('window-close', undefined);
  });

  test('hides native window controls when vm_mode query flag is enabled', () => {
    window.history.replaceState({}, '', '/?vm_mode=1');
    render(<ChatInterface />);

    expect(screen.queryByRole('button', { name: 'Minimize window' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle maximize window' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close window' })).not.toBeInTheDocument();
  });

  test('does not render a connection warning when backend transport disconnects', () => {
    render(<ChatInterface />);
    expect(screen.queryByText('Cannot connect to server right now, try again later.')).not.toBeInTheDocument();

    act(() => {
      mockIpcListeners.get('ipc-status')?.({ isConnected: false });
    });
    expect(screen.queryByText('Cannot connect to server right now, try again later.')).not.toBeInTheDocument();

    act(() => {
      mockIpcListeners.get('ipc-status')?.({ isConnected: true });
    });
    expect(screen.queryByText('Cannot connect to server right now, try again later.')).not.toBeInTheDocument();
  });

  test('does not render a duplicate header logo when sidebar is collapsed', () => {
    const { container } = render(<ChatInterface sidebarOpen={false} />);

    expect(container.querySelector('.chat-header-brand-dot')).toBeNull();
  });

  test('text-to-speech toggle updates speech_mode_enabled', () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle text-to-speech' }));
    expect(mockUpdateConfig).toHaveBeenCalledWith({ speech_mode_enabled: true });
  });

  test('does not render dashboard auto-compaction control when dev UI is disabled', () => {
    render(<ChatInterface />);
    expect(screen.queryByRole('button', { name: 'Run auto compaction' })).not.toBeInTheDocument();
  });

  test('runs compact-history from dashboard when dev auto-compaction control is clicked', async () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    mockConfig = {
      interaction_mode: 'chat',
      speech_mode_enabled: false,
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    };
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Run auto compaction' }));
    expect(mockSetThinkingStatus).toHaveBeenCalledWith('Compacting conversation history...');
    expect(mockSetThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-started');
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        model_provider: 'anthropic',
        selected_model_id: 'claude-sonnet-4-5',
      });
      expect(mockEnsureConversationInferenceSessionHydrated).toHaveBeenCalledWith({
        conversationRef: 'conv_existing',
        userId: 'default_user',
      });
      expect(mockCompactHistory).toHaveBeenCalledWith(true, 'conv_existing');
    });
    expect(mockUpdateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnsureConversationInferenceSessionHydrated.mock.invocationCallOrder[0],
    );
  });

  test('keeps dashboard compaction control clickable even during active stream phases', async () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    mockChatState.streamTracking.phase = 'streaming';
    render(<ChatInterface />);

    const button = screen.getByRole('button', { name: 'Run auto compaction' });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(mockSetThinkingStatus).toHaveBeenCalledWith('Compacting conversation history...');
    expect(mockSetThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-started');
    await waitFor(() => {
      expect(mockCompactHistory).toHaveBeenCalledWith(true, 'conv_existing');
    });
  });

  test('shows model selector and passes composer handlers to input', () => {
    mockConfig = {
      interaction_mode: 'agent',
      model_mode: 'online',
      model_provider: 'openai',
      speech_mode_enabled: false,
      selected_model_id: 'gpt-test-model',
    };
    mockAvailableModels = {
      local: [],
      online: [
        { id: 'gpt-test-model', provider: 'openai' },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('gpt-test-model');
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isSending).toBe(false);
    expect(lastInputProps.isCentered).toBe(true);
    expect(typeof lastInputProps.onSendMessage).toBe('function');
    expect(typeof lastInputProps.onStopResponse).toBe('function');
  });

  test('renders curated model display label when selected_model_id is a legacy runtime id', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('GPT-5.4');
    expect(screen.getByRole('button', { name: 'Model selector' })).not.toHaveTextContent('gpt-5.4');
  });

  test('renders GPT-5.4 instead of stale unavailable legacy OpenAI ids when curated options exist', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5@@gpt-5-nonthinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-none-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 None',
          supports_thinking: true,
          reasoning_mode: 'none',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('GPT-5.4');
    expect(screen.getByRole('button', { name: 'Model selector' })).not.toHaveTextContent('gpt-5@@gpt-5-nonthinking');
  });

  test('deduplicates model dropdown entries to one base model and shows reasoning mode selector when supported', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-none-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 None',
          supports_thinking: true,
          reasoning_mode: 'none',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-medium-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 Medium',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('GPT-5.4');
    expect(screen.getByRole('button', { name: 'Reasoning mode selector' })).toHaveTextContent('None');

    fireEvent.click(screen.getByRole('button', { name: 'Model selector' }));
    expect(screen.getAllByRole('menuitem', { name: 'GPT-5.4' })).toHaveLength(1);
  });

  test('does not show reasoning mode selector for models without multiple reasoning levels', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'anthropic',
      selected_model_id: 'claude-haiku-4-5',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'claude-haiku-4-5',
          runtime_model_id: 'claude-haiku-4-5',
          provider: 'anthropic',
          display_name: 'Claude Haiku 4.5',
          supports_thinking: false,
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.queryByRole('button', { name: 'Reasoning mode selector' })).not.toBeInTheDocument();
  });

  test('falls back to default model label when config is missing', () => {
    mockConfig = null;
    mockAvailableModels = { local: [], online: [] };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('No models available');
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isCentered).toBe(true);
  });

  test('model selector lists only models for selected provider', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3.1-pro-preview',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        { id: 'gemini-3.1-pro-preview', provider: 'gemini' },
        { id: 'gemini-2.5-flash', provider: 'gemini' },
        { id: 'gpt-5.4@@gpt-5-4-none-thinking', provider: 'openai' },
      ],
    };

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole('button', { name: 'Model selector' }));

    expect(screen.getByRole('menuitem', { name: 'gemini-3.1-pro-preview' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'gemini-2.5-flash' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'gpt-5.4@@gpt-5-4-none-thinking' })).not.toBeInTheDocument();
  });

  test('selecting a model updates config with model id and provider', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3.1-pro-preview',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        { id: 'gemini-3.1-pro-preview', provider: 'gemini' },
        { id: 'gemini-2.5-flash', provider: 'gemini' },
      ],
    };

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole('button', { name: 'Model selector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'gemini-2.5-flash' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      selected_model_id: 'gemini-2.5-flash',
      model_provider: 'gemini',
    });
  });

  test('selecting reasoning mode updates config with matching model variant id', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gpt-5.4@@gpt-5-4-none-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 None',
          supports_thinking: true,
          reasoning_mode: 'none',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-medium-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 Medium',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'gpt-5.4@@gpt-5-4-high-thinking',
          runtime_model_id: 'gpt-5.4',
          provider: 'openai',
          display_name: 'GPT-5.4 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole('button', { name: 'Reasoning mode selector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'High' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      selected_model_id: 'gpt-5.4@@gpt-5-4-high-thinking',
      model_provider: 'openai',
    });
  });

  test('shows reasoning mode selector for gemini model families with low/medium/high variants', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3-1-pro-low-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'gemini-3-1-pro-low-thinking',
          runtime_model_id: 'gemini-3.1-pro-preview',
          provider: 'gemini',
          family_id: 'gemini::gemini-3.1-pro-preview',
          family_label: 'Gemini 3.1 Pro',
          default_model_id: 'gemini-3-1-pro-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Gemini 3.1 Pro Low',
          supports_thinking: true,
          reasoning_mode: 'low',
        },
        {
          id: 'gemini-3-1-pro-thinking',
          runtime_model_id: 'gemini-3.1-pro-preview',
          provider: 'gemini',
          family_id: 'gemini::gemini-3.1-pro-preview',
          family_label: 'Gemini 3.1 Pro',
          default_model_id: 'gemini-3-1-pro-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Gemini 3.1 Pro',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'gemini-3-1-pro-high-thinking',
          runtime_model_id: 'gemini-3.1-pro-preview',
          provider: 'gemini',
          family_id: 'gemini::gemini-3.1-pro-preview',
          family_label: 'Gemini 3.1 Pro',
          default_model_id: 'gemini-3-1-pro-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Gemini 3.1 Pro High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('Gemini 3.1 Pro');
    expect(screen.getByRole('button', { name: 'Reasoning mode selector' })).toHaveTextContent('Low');

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning mode selector' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'High' }));

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      selected_model_id: 'gemini-3-1-pro-high-thinking',
      model_provider: 'gemini',
    });
  });

  test('shows reasoning mode selector for anthropic model families with low/medium/high variants', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5-low-thinking',
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        {
          id: 'claude-sonnet-4-5-low-thinking',
          runtime_model_id: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          family_id: 'anthropic::claude-sonnet-4-5-20250929',
          family_label: 'Claude Sonnet 4.5',
          default_model_id: 'claude-sonnet-4-5-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Claude Sonnet 4.5 Low',
          supports_thinking: true,
          reasoning_mode: 'low',
        },
        {
          id: 'claude-sonnet-4-5-thinking',
          runtime_model_id: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          family_id: 'anthropic::claude-sonnet-4-5-20250929',
          family_label: 'Claude Sonnet 4.5',
          default_model_id: 'claude-sonnet-4-5-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Claude Sonnet 4.5',
          supports_thinking: true,
          reasoning_mode: 'medium',
        },
        {
          id: 'claude-sonnet-4-5-high-thinking',
          runtime_model_id: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          family_id: 'anthropic::claude-sonnet-4-5-20250929',
          family_label: 'Claude Sonnet 4.5',
          default_model_id: 'claude-sonnet-4-5-thinking',
          default_reasoning_mode: 'medium',
          reasoning_modes: ['low', 'medium', 'high'],
          display_name: 'Claude Sonnet 4.5 High',
          supports_thinking: true,
          reasoning_mode: 'high',
        },
      ],
    };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('Claude Sonnet 4.5');
    expect(screen.getByRole('button', { name: 'Reasoning mode selector' })).toHaveTextContent('Low');
  });

  test('renders welcome empty state when there are no messages', () => {
    render(<ChatInterface />);
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Welcome to WindieOS Demo')).toBeInTheDocument();
  });

  test('stop response handler sends stop-query while stream is active', () => {
    mockChatState.streamTracking.phase = 'streaming';

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(typeof lastInputProps.onStopResponse).toBe('function');
    lastInputProps.onStopResponse();
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockUpdateStreamTracking).toHaveBeenCalledTimes(1);
  });

  test('stop shortcut sends stop-query while stream is active', () => {
    mockChatState.streamTracking.phase = 'streaming';

    render(<ChatInterface />);

    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(shortcutEvent);

    expect(shortcutEvent.defaultPrevented).toBe(true);
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockUpdateStreamTracking).toHaveBeenCalledTimes(1);
  });

  test('stop shortcut ignores key presses when loop is idle', () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = false;

    render(<ChatInterface />);

    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(shortcutEvent);

    expect(shortcutEvent.defaultPrevented).toBe(false);
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockSetIsSending).not.toHaveBeenCalled();
    expect(mockUpdateStreamTracking).not.toHaveBeenCalled();
  });

  test('stop response handler sends stop-query immediately after send while awaiting first event', () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = true;

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isSending).toBe(true);
    lastInputProps.onStopResponse();
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockUpdateStreamTracking).toHaveBeenCalledTimes(1);
  });

  test('keeps composer in stop state during tool loop even when isSending is false', () => {
    mockChatState.streamTracking.phase = 'tool-call';
    mockChatState.isSending = false;
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'build a dashboard' },
      { id: 'assistant-1', sender: 'assistant', text: '{"tool":"run_shell_command"}', type: 'tool-call' },
    ];

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.isSending).toBe(true);
    expect(typeof lastInputProps.onStopResponse).toBe('function');
  });

  test('shows awaiting dot until the first assistant row is visible', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
    ];
    mockChatState.streamTracking.phase = 'awaiting-first-chunk';
    const { rerender } = render(<ChatInterface />);

    let lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-1');

    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'first chunk', type: 'llm-text' },
    ];
    rerender(<ChatInterface />);
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBeNull();
  });

  test('passes active conversation ref to MessageList for conversation-switch scroll resets', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'world', type: 'llm-text' },
    ];

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.conversationRef).toBe('conv_existing');
  });

  test('shows awaiting dot while local send is pending first token', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
    ];
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = true;

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-1');
  });

  test('keeps awaiting dot visible if streaming phase arrives before the first assistant row renders', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello', type: 'user' },
    ];
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.isSending = false;

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-1');
  });

  test('keeps awaiting dot visible during a later turn when only tool rows exist after the latest user message', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
      { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
      { id: 'tool-call-2', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call' },
      { id: 'tool-output-2', sender: 'assistant', text: '{"ok":true}', type: 'tool-output' },
    ];
    mockChatState.streamTracking.phase = 'tool-output';
    mockChatState.isSending = false;

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-2');
  });

  test('keeps awaiting dot visible during a later turn while send latch is active over a terminal previous phase', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'first task', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'done', type: 'llm-text' },
      { id: 'user-2', sender: 'user', text: 'second task', type: 'user' },
    ];
    mockChatState.streamTracking.phase = 'complete';
    mockChatState.isSending = true;

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.awaitingDotTargetMessageId).toBe('user-2');
  });

  test('stop response handler is a no-op when no active stream is running', () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = false;

    render(<ChatInterface />);

    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    lastInputProps.onStopResponse();
    expect(mockStopQuery).not.toHaveBeenCalled();
  });

  test('dashboard new-chat event clears local conversation state', () => {
    render(<ChatInterface />);

    act(() => {
      window.dispatchEvent(new Event('windie:new-chat'));
    });

    expect(mockClearMessages).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending.mock.calls).toContainEqual([false, null]);
    expect(mockSetThinkingStatus.mock.calls).toContainEqual([null, null]);
    expect(mockSetTokenCounts.mock.calls).toContainEqual([null, null]);
    expect(mockUpdateTranscriptSession.mock.calls.some(([conversationRef]) => (
      typeof conversationRef === 'string' && /^conv_/.test(conversationRef)
    ))).toBe(true);
    expect(mockStopQuery).not.toHaveBeenCalled();
  });

  test('dashboard new-chat event does not stop an in-flight conversation', () => {
    mockChatState.streamTracking.phase = 'streaming';
    mockChatState.isSending = true;

    render(<ChatInterface />);

    act(() => {
      window.dispatchEvent(new Event('windie:new-chat'));
    });

    expect(mockClearMessages).toHaveBeenCalledTimes(1);
    expect(mockUpdateTranscriptSession.mock.calls.some(([conversationRef]) => (
      typeof conversationRef === 'string' && /^conv_/.test(conversationRef)
    ))).toBe(true);
    expect(mockStopQuery).not.toHaveBeenCalled();
  });

  test('passes assistant message action handlers to MessageList when chat has messages', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello' },
      { id: 'assistant-1', sender: 'assistant', text: 'world', type: 'llm-text' },
    ];

    render(<ChatInterface />);

    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.enableAssistantActions).toBe(true);
    expect(lastMessageListProps.disableAssistantActions).toBe(false);
    expect(typeof lastMessageListProps.onAssistantFeedbackChange).toBe('function');
    expect(typeof lastMessageListProps.onAssistantTryAgain).toBe('function');
  });

  test('assistant feedback action updates message feedback state', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'hello' },
      { id: 'assistant-1', sender: 'assistant', text: 'world', type: 'llm-text' },
    ];

    render(<ChatInterface />);
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];

    lastMessageListProps.onAssistantFeedbackChange('assistant-1', 'like');
    expect(mockUpdateMessage).toHaveBeenCalledWith('assistant-1', { feedback: 'like' });
  });

  test('try again rewinds tool loop and re-queries from triggering user message', async () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'create a dashboard for this', type: 'user' },
      { id: 'tool-call-1', sender: 'assistant', text: '{"name":"tool"}', type: 'tool-call', toolName: 'tool' },
      { id: 'tool-output-1', sender: 'assistant', text: '{"ok":true}', type: 'tool-output', toolName: 'tool' },
      { id: 'assistant-final', sender: 'assistant', text: 'Done.', type: 'llm-text' },
    ];

    render(<ChatInterface />);
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];

    await act(async () => {
      await lastMessageListProps.onAssistantTryAgain('assistant-final');
    });

    expect(mockSetMessages).toHaveBeenCalledWith([
      { id: 'user-1', sender: 'user', text: 'create a dashboard for this', type: 'user' },
    ], 'conv_existing');
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null, 'conv_existing');
    expect(mockSetIsSending).toHaveBeenCalledWith(true, 'conv_existing');

    expect(mockIpcInvoke).toHaveBeenCalledWith('delete-conversation', {
      userId: 'default_user',
      conversationId: 'conv_existing',
      recordKind: 'transcript',
    });
    expect(mockIpcInvoke).toHaveBeenCalledWith('delete-conversation', {
      userId: 'default_user',
      conversationId: 'conv_existing',
      recordKind: 'transcript_replay',
    });
    expect(mockIpcInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      content: 'create a dashboard for this',
      role: 'user',
      messageType: 'user',
      conversationRef: 'conv_existing',
      userId: 'default_user',
    }));
    const sawExpectedRehydrateCall = mockRehydrateConversationInferenceSession.mock.calls.some(
      ([payload]) => payload?.conversationRef === 'conv_existing'
        && Array.isArray(payload?.messages)
        && payload.messages.length === 0,
    );
    expect(sawExpectedRehydrateCall).toBe(true);
    const sawExpectedSendQueryCall = mockSendQuery.mock.calls.some(
      ([queryText, conversationRef, screenshotRef, screenshotUrl, screenshotRefs]) => (
        queryText === 'create a dashboard for this'
        && conversationRef === 'conv_existing'
        && (screenshotRef ?? null) === null
        && (screenshotUrl ?? null) === null
        && (screenshotRefs ?? null) === null
      ),
    );
    expect(sawExpectedSendQueryCall).toBe(true);
  });

  test('user edit rewinds assistant output and re-queries with edited text', async () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'old prompt', type: 'user' },
      { id: 'assistant-1', sender: 'assistant', text: 'old response', type: 'llm-text' },
    ];

    render(<ChatInterface />);
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];

    await act(async () => {
      await lastMessageListProps.onUserEdit('user-1', 'new prompt');
    });

    expect(mockSetMessages).toHaveBeenCalledWith([
      { id: 'user-1', sender: 'user', text: 'new prompt', type: 'user' },
    ], 'conv_existing');
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null, 'conv_existing');
    expect(mockSetIsSending).toHaveBeenCalledWith(true, 'conv_existing');

    expect(mockIpcInvoke).toHaveBeenCalledWith('delete-conversation', {
      userId: 'default_user',
      conversationId: 'conv_existing',
      recordKind: 'transcript',
    });
    expect(mockIpcInvoke).toHaveBeenCalledWith('delete-conversation', {
      userId: 'default_user',
      conversationId: 'conv_existing',
      recordKind: 'transcript_replay',
    });
    expect(mockIpcInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      content: 'new prompt',
      role: 'user',
      messageType: 'user',
      conversationRef: 'conv_existing',
      userId: 'default_user',
    }));
    expect(mockRehydrateConversationInferenceSession).toHaveBeenCalledWith({
      conversationRef: 'conv_existing',
      messages: [],
    });
    const sawEditedSendQueryCall = mockSendQuery.mock.calls.some(
      ([queryText, conversationRef, screenshotRef, screenshotUrl, screenshotRefs]) => (
        queryText === 'new prompt'
        && conversationRef === 'conv_existing'
        && (screenshotRef ?? null) === null
        && (screenshotUrl ?? null) === null
        && (screenshotRefs ?? null) === null
      ),
    );
    expect(sawEditedSendQueryCall).toBe(true);
  });

  test('command+f opens the find bar and focuses the search input', async () => {
    render(<ChatInterface />);

    const shortcutEvent = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(shortcutEvent);
    });

    expect(shortcutEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('search', { name: 'Find in conversation' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('textbox', { name: 'Find in conversation input' }),
      );
    });
  });

  test('find bar computes visible thread matches and wraps next and previous navigation', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Alpha beta alpha' },
      { id: 'assistant-1', sender: 'assistant', text: 'alpha again', type: 'llm-text', isComplete: true },
    ];

    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Find in conversation' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Find in conversation input' }), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('1/3')).toBeInTheDocument();

    let lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.findQuery).toBe('alpha');
    expect(lastMessageListProps.messageFindMatchIndexesById).toEqual({
      'assistant-1': [2],
      'user-1': [0, 1],
    });
    expect(lastMessageListProps.activeFindMatchIndex).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.activeFindMatchIndex).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
    expect(screen.getByText('1/3')).toBeInTheDocument();
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.activeFindMatchIndex).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
    expect(screen.getByText('3/3')).toBeInTheDocument();
    lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.activeFindMatchIndex).toBe(2);
  });

  test('closing the find bar clears the active query and match props', () => {
    mockChatState.messages = [
      { id: 'user-1', sender: 'user', text: 'Alpha beta alpha' },
    ];

    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Find in conversation' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Find in conversation input' }), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('1/2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close find in conversation' }));

    expect(screen.queryByRole('search', { name: 'Find in conversation' })).not.toBeInTheDocument();
    const lastMessageListProps = mockMessageList.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.findQuery).toBe('');
    expect(lastMessageListProps.messageFindMatchIndexesById).toEqual({});
    expect(lastMessageListProps.activeFindMatchIndex).toBeNull();
  });
});
