import React from 'react';
import { act, render } from '@testing-library/react';

import ChatBox from '../../frontend/src/renderer/features/chat/components/ChatBox';

const mockInvoke = jest.fn().mockResolvedValue({ success: true });

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

jest.mock('../../frontend/src/renderer/features/chat/stores/chatStore', () => ({
  useChatStore: () => ({
    messages: [],
    isSending: false,
    thinkingStatus: null,
  }),
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: { interaction_mode: 'chat' },
  }),
}));

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: () => ({
    sendMessage: jest.fn(),
  }),
}));

describe('ChatBox overlay mouse ignore', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
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
});
