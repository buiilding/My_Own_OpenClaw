import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChatBox from '../../frontend/src/renderer/features/chat/components/ChatBox';

const mockInvoke = jest.fn().mockResolvedValue({ success: true });
const mockSendMessage = jest.fn();
const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: mockSendMessage,
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    on: () => () => {},
  },
  INVOKE_CHANNELS: {
    SET_OVERLAY_IGNORE_MOUSE: 'set-overlay-ignore-mouse',
    SET_CHATBOX_SIZE: 'set-chatbox-size',
    SHOW_MAIN_WINDOW: 'show-main-window',
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

describe('ChatBox overlay mouse ignore', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockUseChatMessageSender.mockClear();
    mockSendMessage.mockClear();
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
});
