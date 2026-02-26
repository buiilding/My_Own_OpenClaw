import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChatInterface from '../../frontend/src/renderer/features/chat/components/ChatInterface';
const { selectMockStoreState: mockSelectStoreState } = require('./storeSelectorTestUtils.cjs');

const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: jest.fn(),
}));
let mockConfig = {
  interaction_mode: 'chat',
  voice_mode_enabled: false,
  speech_mode_enabled: false,
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
const mockSendQuery = jest.fn();
const mockSendRehydrateConversation = jest.fn();
const mockClearMessages = jest.fn();
const mockSetMessages = jest.fn();
const mockUpdateMessage = jest.fn();
const mockSetIsSending = jest.fn();
const mockSetThinkingStatus = jest.fn();
const mockSetThinkingSourceEventType = jest.fn();
const mockSetTokenCounts = jest.fn();
const mockUpdateStreamTracking = jest.fn();
const mockSetActiveConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();
const mockGetActiveConversationRef = jest.fn(() => 'conv_existing');
const mockGetTranscriptSessionInfo = jest.fn(() => ({
  conversationRef: 'conv_existing',
  userId: 'default_user',
}));
const mockIpcInvoke = jest.fn(async () => ({ success: true }));
const mockMessageList = jest.fn(() => <div data-testid="message-list" />);
const mockChatState = {
  messages: [],
  isSending: false,
  thinkingStatus: null,
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
    sendQuery: (...args) => mockSendQuery(...args),
    sendRehydrateConversation: (...args) => mockSendRehydrateConversation(...args),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
  updateTranscriptSession: (...args) => mockUpdateTranscriptSession(...args),
  getActiveConversationRef: (...args) => mockGetActiveConversationRef(...args),
  getTranscriptSessionInfo: (...args) => mockGetTranscriptSessionInfo(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: () => () => {},
    invoke: (...args) => mockIpcInvoke(...args),
  },
  INVOKE_CHANNELS: {
    DELETE_CONVERSATION: 'delete-conversation',
    STORE_TRANSCRIPT: 'store-transcript',
  },
  ON_CHANNELS: {
    FROM_BACKEND: 'from-backend',
  },
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

describe('ChatInterface wiring', () => {
  beforeEach(() => {
    mockConfig = {
      interaction_mode: 'chat',
      voice_mode_enabled: false,
      speech_mode_enabled: false,
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
    mockSendQuery.mockClear();
    mockSendRehydrateConversation.mockClear();
    mockClearMessages.mockClear();
    mockSetMessages.mockClear();
    mockUpdateMessage.mockClear();
    mockSetIsSending.mockClear();
    mockSetThinkingStatus.mockClear();
    mockSetThinkingSourceEventType.mockClear();
    mockSetTokenCounts.mockClear();
    mockUpdateStreamTracking.mockClear();
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
    mockMessageList.mockClear();
    mockUpdateConfig.mockClear();
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.messages = [];
    mockChatState.isSending = false;
    mockChatState.thinkingStatus = null;
  });

  test('uses main-window sender surface for centralized send behavior', () => {
    render(<ChatInterface />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(
      expect.any(Function),
      { senderSurface: 'main-window' },
    );
  });

  test('shows text-to-speech toggle in header', () => {
    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Toggle text-to-speech' })).toBeInTheDocument();
  });

  test('text-to-speech toggle updates speech_mode_enabled', () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle text-to-speech' }));
    expect(mockUpdateConfig).toHaveBeenCalledWith({ speech_mode_enabled: true });
  });

  test('shows model selector and passes enabled voice mode to input', () => {
    mockConfig = {
      interaction_mode: 'agent',
      model_mode: 'online',
      model_provider: 'openai',
      voice_mode_enabled: true,
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
    expect(lastInputProps.voiceModeEnabled).toBe(true);
    expect(lastInputProps.isSending).toBe(false);
    expect(lastInputProps.isCentered).toBe(true);
    expect(typeof lastInputProps.onSendMessage).toBe('function');
    expect(typeof lastInputProps.onStopResponse).toBe('function');
  });

  test('falls back to default model label and disabled voice mode when config is missing', () => {
    mockConfig = null;
    mockAvailableModels = { local: [], online: [] };

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('No models available');
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.voiceModeEnabled).toBe(false);
    expect(lastInputProps.isCentered).toBe(true);
  });

  test('model selector lists only models for selected provider', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3.1-pro-preview',
      voice_mode_enabled: false,
      speech_mode_enabled: false,
    };
    mockAvailableModels = {
      local: [],
      online: [
        { id: 'gemini-3.1-pro-preview', provider: 'gemini' },
        { id: 'gemini-2.5-flash', provider: 'gemini' },
        { id: 'gpt-5.1', provider: 'openai' },
      ],
    };

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole('button', { name: 'Model selector' }));

    expect(screen.getByRole('menuitem', { name: 'gemini-3.1-pro-preview' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'gemini-2.5-flash' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'gpt-5.1' })).not.toBeInTheDocument();
  });

  test('selecting a model updates config with model id and provider', () => {
    mockConfig = {
      interaction_mode: 'chat',
      model_mode: 'online',
      model_provider: 'gemini',
      selected_model_id: 'gemini-3.1-pro-preview',
      voice_mode_enabled: false,
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

  test('renders welcome empty state when there are no messages', () => {
    render(<ChatInterface />);
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Good to see you, peter.')).toBeInTheDocument();
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

  test('stop response handler is a no-op when no active stream is running', () => {
    mockChatState.streamTracking.phase = 'idle';

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
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockSetTokenCounts).toHaveBeenCalledWith(null);
    expect(mockSetActiveConversationRef).toHaveBeenCalledWith(expect.stringMatching(/^conv_/));
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
    ]);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockSetIsSending).toHaveBeenCalledWith(true);

    expect(mockIpcInvoke).toHaveBeenCalledWith('delete-conversation', {
      userId: 'default_user',
      conversationId: 'conv_existing',
      recordKind: 'transcript',
    });
    expect(mockIpcInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      content: 'create a dashboard for this',
      role: 'user',
      messageType: 'user',
      conversationRef: 'conv_existing',
      userId: 'default_user',
    }));
    expect(mockSendRehydrateConversation).toHaveBeenCalledWith('conv_existing', [
      {
        role: 'user',
        content: 'create a dashboard for this',
        message_type: 'user',
        tool_name: null,
        correlation_id: null,
        timestamp: null,
        screenshot_ref: null,
        screenshot: null,
      },
    ]);
    expect(mockSendQuery).toHaveBeenCalledWith(
      'create a dashboard for this',
      'conv_existing',
      null,
      null,
    );
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
    ]);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockSetIsSending).toHaveBeenCalledWith(true);

    expect(mockIpcInvoke).toHaveBeenCalledWith('delete-conversation', {
      userId: 'default_user',
      conversationId: 'conv_existing',
      recordKind: 'transcript',
    });
    expect(mockIpcInvoke).toHaveBeenCalledWith('store-transcript', expect.objectContaining({
      content: 'new prompt',
      role: 'user',
      messageType: 'user',
      conversationRef: 'conv_existing',
      userId: 'default_user',
    }));
    expect(mockSendRehydrateConversation).toHaveBeenCalledWith('conv_existing', []);
    expect(mockSendQuery).toHaveBeenCalledWith('new prompt', 'conv_existing', null, null);
  });
});
