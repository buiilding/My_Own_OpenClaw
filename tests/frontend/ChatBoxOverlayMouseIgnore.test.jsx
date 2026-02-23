import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChatBox from '../../frontend/src/renderer/features/chat/components/ChatBox';

const mockInvoke = jest.fn().mockResolvedValue({ success: true });
const mockSend = jest.fn();
const mockStopQuery = jest.fn();
const mockClearMessages = jest.fn();
const mockSetIsSending = jest.fn();
const mockSetThinkingStatus = jest.fn();
const mockSetTokenCounts = jest.fn();
const mockUpdateStreamTracking = jest.fn();
const mockSetActiveConversationRef = jest.fn();
const mockSendMessage = jest.fn();
const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: mockSendMessage,
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    send: (...args) => mockSend(...args),
    on: () => () => {},
  },
  SEND_CHANNELS: {
    MOVE_CHATBOX_TO: 'move-chatbox-to',
  },
  INVOKE_CHANNELS: {
    SET_OVERLAY_IGNORE_MOUSE: 'set-overlay-ignore-mouse',
    SET_CHATBOX_SIZE: 'set-chatbox-size',
    SHOW_MAIN_WINDOW: 'show-main-window',
    HIDE_CHATBOX: 'hide-chatbox',
  },
  ON_CHANNELS: {
    CHATBOX_FOCUS: 'chatbox-focus',
  },
}));

const mockChatState = {
  messages: [],
  isSending: false,
  thinkingStatus: null,
  streamTracking: { phase: 'idle' },
  clearMessages: (...args) => mockClearMessages(...args),
  setIsSending: (...args) => mockSetIsSending(...args),
  setThinkingStatus: (...args) => mockSetThinkingStatus(...args),
  setTokenCounts: (...args) => mockSetTokenCounts(...args),
  updateStreamTracking: (...args) => mockUpdateStreamTracking(...args),
};

jest.mock('../../frontend/src/renderer/features/chat/stores/chatStore', () => ({
  useChatStore: (selector) => (typeof selector === 'function' ? selector(mockChatState) : mockChatState),
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: { interaction_mode: 'chat' },
  }),
}));

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: (...args) => mockUseChatMessageSender(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    stopQuery: (...args) => mockStopQuery(...args),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
}));

describe('ChatBox overlay mouse ignore', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockSend.mockClear();
    mockUseChatMessageSender.mockClear();
    mockSendMessage.mockClear();
    mockStopQuery.mockClear();
    mockClearMessages.mockClear();
    mockSetIsSending.mockClear();
    mockSetThinkingStatus.mockClear();
    mockSetTokenCounts.mockClear();
    mockUpdateStreamTracking.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockChatState.streamTracking.phase = 'idle';
  });

  test('defaults to interactive overlay and requests window resize to match pill', () => {
    const rafQueue = [];
    global.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };

    const { container } = render(<ChatBox />);

    // default: interactive (not click-through)
    const sawInteractive = mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-overlay-ignore-mouse' && payload?.ignore === false,
    );
    expect(sawInteractive).toBe(true);

    const shell = container.querySelector('.chatbox-shell');
    expect(shell).toBeTruthy();

    shell.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
    });

    act(() => {
      rafQueue.splice(0).forEach((cb) => cb());
    });

    const sawResize = mockInvoke.mock.calls.some(
      ([channel, payload]) =>
        channel === 'set-chatbox-size'
        && payload?.width === 200
        && payload?.height === 100,
    );
    expect(sawResize).toBe(true);
  });

  test('wires overlay sender surface for centralized UI send behavior', () => {
    render(<ChatBox />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(undefined, {
      senderSurface: 'overlay-chatbox',
    });
  });

  test('settings button invokes show-main-window', () => {
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    const sawShowMainWindow = mockInvoke.mock.calls.some(
      ([channel]) => channel === 'show-main-window',
    );
    expect(sawShowMainWindow).toBe(true);
  });

  test('close button invokes hide-chatbox', () => {
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Close chatbox' }));

    const sawHideChatbox = mockInvoke.mock.calls.some(
      ([channel]) => channel === 'hide-chatbox',
    );
    expect(sawHideChatbox).toBe(true);
  });

  test('dragging pill sends absolute move-chatbox-to coordinates', () => {
    Object.defineProperty(window, 'screenX', {
      value: 90,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'screenY', {
      value: 90,
      configurable: true,
      writable: true,
    });

    const { container } = render(<ChatBox />);
    const pill = container.querySelector('.chatbox-pill');
    expect(pill).toBeTruthy();

    fireEvent.mouseDown(pill, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 18, clientY: 20, screenX: 110, screenY: 118 });
    fireEvent.mouseUp(window);

    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 100, y: 108 });
  });

  test('input interactions do not start drag movement', () => {
    Object.defineProperty(window, 'screenX', {
      value: 90,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'screenY', {
      value: 90,
      configurable: true,
      writable: true,
    });

    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Type a command…');

    fireEvent.mouseDown(input, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 34, clientY: 30, screenX: 140, screenY: 130 });
    fireEvent.mouseUp(window);

    expect(mockSend).not.toHaveBeenCalledWith('move-chatbox-to', expect.anything());
  });

  test('stop button calls stop-query when a response is active', () => {
    mockChatState.streamTracking.phase = 'streaming';
    render(<ChatBox />);

    const stopButton = screen.getByRole('button', { name: 'Stop response' });
    expect(stopButton).toBeEnabled();

    fireEvent.click(stopButton);
    expect(mockStopQuery).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockUpdateStreamTracking).toHaveBeenCalledTimes(1);
  });

  test('stop button remains disabled while idle', () => {
    mockChatState.streamTracking.phase = 'idle';
    render(<ChatBox />);

    expect(screen.getByRole('button', { name: 'Stop response' })).toBeDisabled();
  });

  test('new chat button clears local conversation state', () => {
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    expect(mockClearMessages).toHaveBeenCalledTimes(1);
    expect(mockSetIsSending).toHaveBeenCalledWith(false);
    expect(mockSetThinkingStatus).toHaveBeenCalledWith(null);
    expect(mockSetTokenCounts).toHaveBeenCalledWith(null);
    expect(mockSetActiveConversationRef).toHaveBeenCalledWith(expect.stringMatching(/^conv_/));
  });
});
