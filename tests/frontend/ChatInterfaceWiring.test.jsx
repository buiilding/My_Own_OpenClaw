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
const mockUpdateConfig = jest.fn();
const mockMessageInput = jest.fn(() => <div data-testid="message-input" />);

const mockPlayerService = {
  cleanup: jest.fn(),
  enqueueAudio: jest.fn(),
  stopPlayback: jest.fn(),
};
const mockStopQuery = jest.fn();
const mockClearMessages = jest.fn();
const mockSetIsSending = jest.fn();
const mockSetThinkingStatus = jest.fn();
const mockSetTokenCounts = jest.fn();
const mockUpdateStreamTracking = jest.fn();
const mockSetActiveConversationRef = jest.fn();
const mockChatState = {
  messages: [],
  isSending: false,
  thinkingStatus: null,
  tokenCounts: null,
  streamTracking: { phase: 'idle' },
  clearMessages: (...args) => mockClearMessages(...args),
  setIsSending: (...args) => mockSetIsSending(...args),
  setThinkingStatus: (...args) => mockSetThinkingStatus(...args),
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
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../frontend/src/renderer/infrastructure/audio/PlayerService', () => ({
  PlayerService: jest.fn(() => mockPlayerService),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    stopQuery: (...args) => mockStopQuery(...args),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: () => () => {},
  },
  ON_CHANNELS: {
    FROM_BACKEND: 'from-backend',
  },
}));

jest.mock('../../frontend/src/renderer/features/chat/utils/backendAudioEvents', () => ({
  extractAudioChunkPayload: () => null,
}));

jest.mock('../../frontend/src/renderer/features/chat/components/MessageList', () => () => (
  <div data-testid="message-list" />
));

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
    mockMessageInput.mockClear();
    mockUseChatMessageSender.mockClear();
    mockPlayerService.cleanup.mockClear();
    mockPlayerService.enqueueAudio.mockClear();
    mockPlayerService.stopPlayback.mockClear();
    mockStopQuery.mockClear();
    mockClearMessages.mockClear();
    mockSetIsSending.mockClear();
    mockSetThinkingStatus.mockClear();
    mockSetTokenCounts.mockClear();
    mockUpdateStreamTracking.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockUpdateConfig.mockClear();
    mockChatState.streamTracking.phase = 'idle';
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
      voice_mode_enabled: true,
      speech_mode_enabled: false,
      selected_model_id: 'gpt-test-model',
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

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Model selector' })).toHaveTextContent('ChatGPT 5.2 Thinking');
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.voiceModeEnabled).toBe(false);
    expect(lastInputProps.isCentered).toBe(true);
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
});
