import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ChatInterface from '../../frontend/src/renderer/features/chat/components/ChatInterface';

const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: jest.fn(),
}));
const mockInvoke = jest.fn().mockResolvedValue({ success: true });
let mockConfig = {
  interaction_mode: 'chat',
  voice_mode_enabled: false,
};
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
  useChatStore: (selector) => (typeof selector === 'function' ? selector(mockChatState) : mockChatState),
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: mockConfig,
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
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    WINDOW_CLOSE: 'window-close',
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

jest.mock('../../frontend/src/renderer/features/chat/components/TokenCountDisplay', () => () => (
  <div data-testid="token-count" />
));

describe('ChatInterface wiring', () => {
  beforeEach(() => {
    mockConfig = {
      interaction_mode: 'chat',
      voice_mode_enabled: false,
    };
    mockMessageInput.mockClear();
    mockUseChatMessageSender.mockClear();
    mockInvoke.mockClear();
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
    mockChatState.streamTracking.phase = 'idle';
  });

  test('uses main-window sender surface for centralized send behavior', () => {
    render(<ChatInterface />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(
      expect.any(Function),
      { senderSurface: 'main-window' },
    );
  });

  test('window controls invoke matching IPC channels', () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle maximize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

    const invokedChannels = mockInvoke.mock.calls.map(([channel]) => channel);
    expect(invokedChannels).toEqual(
      expect.arrayContaining([
        'window-minimize',
        'window-toggle-maximize',
        'window-close',
      ]),
    );
  });

  test('shows agent mode badge and passes enabled voice mode to input', () => {
    mockConfig = {
      interaction_mode: 'agent',
      voice_mode_enabled: true,
    };

    render(<ChatInterface />);

    expect(screen.getByText('Mode: Agent')).toBeInTheDocument();
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.voiceModeEnabled).toBe(true);
    expect(lastInputProps.isSending).toBe(false);
    expect(typeof lastInputProps.onSendMessage).toBe('function');
  });

  test('falls back to chat mode label and disabled voice mode when config is missing', () => {
    mockConfig = null;

    render(<ChatInterface />);

    expect(screen.getByText('Mode: Chat')).toBeInTheDocument();
    const lastInputProps = mockMessageInput.mock.calls.at(-1)?.[0];
    expect(lastInputProps.voiceModeEnabled).toBe(false);
  });

  test('stop button sends stop-query while stream is active', () => {
    mockChatState.streamTracking.phase = 'streaming';

    render(<ChatInterface />);

    const stopButton = screen.getByRole('button', { name: 'Stop response' });
    expect(stopButton.disabled).toBe(false);

    fireEvent.click(stopButton);
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockUpdateStreamTracking).toHaveBeenCalledTimes(1);
  });

  test('stop button is disabled when no active stream is running', () => {
    mockChatState.streamTracking.phase = 'idle';

    render(<ChatInterface />);

    expect(screen.getByRole('button', { name: 'Stop response' }).disabled).toBe(true);
  });

  test('new chat button clears local conversation state', () => {
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(mockClearMessages).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockSetTokenCounts).toHaveBeenCalledWith(null);
    expect(mockSetActiveConversationRef).toHaveBeenCalledWith(null);
    expect(mockStopQuery).not.toHaveBeenCalled();
  });
});
