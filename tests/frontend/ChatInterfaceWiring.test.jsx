import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ChatInterface from '../../frontend/src/renderer/features/chat/components/ChatInterface';

const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: jest.fn(),
}));
const mockInvoke = jest.fn().mockResolvedValue({ success: true });

const mockPlayerService = {
  cleanup: jest.fn(),
  enqueueAudio: jest.fn(),
  stopPlayback: jest.fn(),
};

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: (...args) => mockUseChatMessageSender(...args),
}));

jest.mock('../../frontend/src/renderer/features/chat/stores/chatStore', () => ({
  useChatStore: () => ({
    messages: [],
    isSending: false,
    thinkingStatus: null,
    tokenCounts: null,
  }),
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: {
      interaction_mode: 'chat',
      voice_mode_enabled: false,
    },
  }),
}));

jest.mock('../../frontend/src/renderer/infrastructure/audio/PlayerService', () => ({
  PlayerService: jest.fn(() => mockPlayerService),
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

jest.mock('../../frontend/src/renderer/features/chat/components/MessageInput', () => () => (
  <div data-testid="message-input" />
));

jest.mock('../../frontend/src/renderer/features/chat/components/TokenCountDisplay', () => () => (
  <div data-testid="token-count" />
));

describe('ChatInterface wiring', () => {
  beforeEach(() => {
    mockUseChatMessageSender.mockClear();
    mockInvoke.mockClear();
    mockPlayerService.cleanup.mockClear();
    mockPlayerService.enqueueAudio.mockClear();
    mockPlayerService.stopPlayback.mockClear();
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
});
