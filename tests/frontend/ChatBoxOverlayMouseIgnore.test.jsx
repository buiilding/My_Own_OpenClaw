import React from 'react';
import { waitFor } from '@testing-library/react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChatBox from '../../frontend/src/renderer/features/chat/components/ChatBox';

const mockInvoke = jest.fn((channel) => {
  if (channel === 'get-system-state') {
    return Promise.resolve({});
  }
  return Promise.resolve({ success: true });
});
const mockSend = jest.fn();
const mockSendMessage = jest.fn();
const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: mockSendMessage,
}));
const GET_SYSTEM_STATE = 'get-system-state';

const setWindowScreenPosition = (x, y) => {
  Object.defineProperty(window, 'screenX', {
    value: x,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'screenY', {
    value: y,
    configurable: true,
    writable: true,
  });
};

const mockSystemStateResponse = (valueOrFactory) => {
  mockInvoke.mockImplementation((channel) => {
    if (channel === GET_SYSTEM_STATE) {
      return typeof valueOrFactory === 'function'
        ? valueOrFactory()
        : Promise.resolve(valueOrFactory);
    }
    return Promise.resolve({ success: true });
  });
};

const renderAndGetContextIndicator = () => {
  const { container } = render(<ChatBox />);
  const contextIndicator = container.querySelector('.chatbox-context-indicator');
  expect(contextIndicator).toBeTruthy();
  return contextIndicator;
};

const expectInvokeCall = (predicate) => {
  const sawCall = mockInvoke.mock.calls.some(predicate);
  expect(sawCall).toBe(true);
};

const expectActiveAppIndicator = async ({
  ariaLabel,
  initials,
  contextIndicator,
  stateClass,
}) => {
  await waitFor(() => {
    expect(screen.getByLabelText(ariaLabel)).toBeInTheDocument();
  });

  if (stateClass && contextIndicator) {
    expect(contextIndicator.classList.contains(stateClass)).toBe(true);
  }

  if (initials) {
    expect(screen.getByText(initials)).toBeInTheDocument();
  }
};

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
    GET_SYSTEM_STATE: 'get-system-state',
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
  useChatStore: (selector) =>
    require('./storeSelectorTestUtils.cjs').selectMockStoreState(selector, mockChatState),
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
    mockSystemStateResponse({});
    mockSend.mockClear();
    mockUseChatMessageSender.mockClear();
    mockSendMessage.mockClear();
    mockChatState.messages = [];
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

    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'set-chatbox-size'
        && payload?.width === 200
        && payload?.height === 100,
    );
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

    expectInvokeCall(
      ([channel]) => channel === 'show-main-window',
    );
  });

  test('dragging pill sends absolute move-chatbox-to coordinates', () => {
    setWindowScreenPosition(90, 90);

    const { container } = render(<ChatBox />);
    const pill = container.querySelector('.chatbox-pill');
    expect(pill).toBeTruthy();

    fireEvent.mouseDown(pill, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 18, clientY: 20, screenX: 110, screenY: 118 });
    fireEvent.mouseUp(window);

    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 100, y: 108 });
  });

  test('input interactions do not start drag movement', () => {
    setWindowScreenPosition(90, 90);

    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me anything...');

    fireEvent.mouseDown(input, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 34, clientY: 30, screenX: 140, screenY: 130 });
    fireEvent.mouseUp(window);

    expect(mockSend).not.toHaveBeenCalledWith('move-chatbox-to', expect.anything());
  });

  test('adds ambient loop glow class while active stream phases are running', () => {
    mockChatState.streamTracking.phase = 'tool-call';
    const { container, rerender } = render(<ChatBox />);
    const shellWrap = container.querySelector('.chatbox-shell-wrap');
    expect(shellWrap).toBeTruthy();
    expect(shellWrap.classList.contains('loop-active')).toBe(true);

    mockChatState.streamTracking.phase = 'idle';
    rerender(<ChatBox />);
    expect(shellWrap.classList.contains('loop-active')).toBe(false);
  });

  test('send button dispatches message and clears input', async () => {
    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me anything...');
    fireEvent.change(input, { target: { value: 'hello world' } });
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(mockSendMessage).toHaveBeenCalledWith('hello world');
    expect(input).toHaveValue('');
  });

  test('shows ambient active app indicator from system-state polling', async () => {
    mockSystemStateResponse({ active_window: 'main.py - Visual Studio Code' });

    render(<ChatBox />);

    await expectActiveAppIndicator({
      ariaLabel: 'Active app: VS Code',
      initials: 'ED',
    });
  });

  test('shows offline context state when active-window polling fails', async () => {
    mockSystemStateResponse(() => Promise.reject(new Error('system unavailable')));
    const contextIndicator = renderAndGetContextIndicator();

    await expectActiveAppIndicator({
      ariaLabel: 'Active app: No active app (offline)',
      contextIndicator,
      stateClass: 'is-offline',
    });
  });

  test('falls back to user-message metadata active-window context when polling fails', async () => {
    mockChatState.messages = [
      {
        id: 'user-1',
        sender: 'user',
        text: 'open email',
        fullUserMessage: {
          content: 'open email',
          metadata: {
            active_window: 'Inbox - Gmail - Google Chrome',
          },
        },
      },
    ];

    mockSystemStateResponse(() => Promise.reject(new Error('system unavailable')));
    const contextIndicator = renderAndGetContextIndicator();

    await expectActiveAppIndicator({
      ariaLabel: 'Active app: Chrome (stale)',
      initials: 'WB',
      contextIndicator,
      stateClass: 'is-stale',
    });
  });
});
