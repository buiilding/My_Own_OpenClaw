import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChatBox from '../../frontend/src/renderer/features/chat/components/ChatBox';

const mockInvoke = jest.fn(() => Promise.resolve({ success: true }));
const mockSend = jest.fn();
const mockListeners = new Map();
const mockSendMessage = jest.fn();
const mockGetRoundedFrameSize = jest.fn();
const mockExtractOSstate = jest.fn();
const mockUseChatMessageSender = jest.fn(() => ({
  sendMessage: mockSendMessage,
}));
const mockUseVoiceMode = jest.fn(() => ({
  isConnected: false,
  isRecording: false,
  error: null,
  clientId: null,
}));
const mockUpdateConfig = jest.fn();
const mockCompactHistory = jest.fn();
const mockIsDevUiEnabled = jest.fn(() => false);
const WITH_PREVIEW_TOP_HEADROOM_PX = 14;

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

const expectInvokeCall = (predicate) => {
  const sawCall = mockInvoke.mock.calls.some(predicate);
  expect(sawCall).toBe(true);
};

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    send: (...args) => mockSend(...args),
    on: (channel, listener) => {
      mockListeners.set(channel, listener);
      return () => {
        mockListeners.delete(channel);
      };
    },
  },
  SEND_CHANNELS: {
    MOVE_CHATBOX_TO: 'move-chatbox-to',
  },
  INVOKE_CHANNELS: {
    SET_OVERLAY_IGNORE_MOUSE: 'set-overlay-ignore-mouse',
    SET_CHATBOX_SIZE: 'set-chatbox-size',
    SHOW_MAIN_WINDOW: 'show-main-window',
  },
  ON_CHANNELS: {
    CHATBOX_FOCUS: 'chatbox-focus',
    WAKEWORD_STT_TRIGGER: 'wakeword-stt-trigger',
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
    config: {
      interaction_mode: 'chat',
      wakeword_stt_enabled: false,
      speech_mode_enabled: false,
    },
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../frontend/src/renderer/features/voice/hooks/useVoiceMode', () => ({
  useVoiceMode: (...args) => mockUseVoiceMode(...args),
}));

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: (...args) => mockUseChatMessageSender(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    compactHistory: (...args) => mockCompactHistory(...args),
  },
}));

jest.mock('../../frontend/src/renderer/features/chat/utils/devUiFlag', () => ({
  isDevUiEnabled: () => mockIsDevUiEnabled(),
}));

jest.mock('../../frontend/src/renderer/features/chat/utils/overlayFrameSize', () => ({
  getRoundedFrameSize: (...args) => mockGetRoundedFrameSize(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/SystemCapture', () => ({
  extractOSstate: (...args) => mockExtractOSstate(...args),
}));

describe('ChatBox overlay mouse ignore', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockSend.mockClear();
    mockListeners.clear();
    mockUseChatMessageSender.mockClear();
    mockUseVoiceMode.mockClear();
    mockUpdateConfig.mockClear();
    mockSendMessage.mockClear();
    mockCompactHistory.mockClear();
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
    mockGetRoundedFrameSize.mockReset();
    mockGetRoundedFrameSize.mockImplementation(() => ({ width: 200, height: 100 }));
    mockExtractOSstate.mockReset();
    mockExtractOSstate.mockResolvedValue({
      screenshot: 'ZmFrZS1zY3JlZW5zaG90',
      screenshotContentType: 'image/png',
    });
    mockChatState.messages = [];
    mockChatState.streamTracking.phase = 'idle';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('defaults to interactive overlay and requests window resize to match pill', () => {
    jest.useFakeTimers();
    const rafQueue = [];
    global.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    global.cancelAnimationFrame = jest.fn();

    const { container } = render(<ChatBox />);

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
    mockGetRoundedFrameSize.mockReturnValue({ width: 200, height: 100 });

    act(() => {
      rafQueue.splice(0).forEach((cb) => cb());
      jest.advanceTimersByTime(45);
    });

    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'set-chatbox-size'
        && payload?.width === 200
        && payload?.height === 100
        && Number.isFinite(payload?.anchor_bottom),
    );
    jest.useRealTimers();
  });

  test('reuses cached compact height when the last image preview is removed', async () => {
    jest.useFakeTimers();
    const rafQueue = [];
    global.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    global.cancelAnimationFrame = jest.fn();
    const flushResizeSync = async () => {
      await act(async () => {
        rafQueue.splice(0).forEach((cb) => cb());
        jest.advanceTimersByTime(45);
        await Promise.resolve();
      });
    };
    const resizeHeights = () => mockInvoke.mock.calls
      .filter(([channel]) => channel === 'set-chatbox-size')
      .map(([, payload]) => payload?.height);
    let measuredFrame = { width: 200, height: 52 };
    mockGetRoundedFrameSize.mockImplementation(() => measuredFrame);

    render(<ChatBox />);
    await flushResizeSync();
    expect(resizeHeights().at(-1)).toBe(52);

    measuredFrame = { width: 200, height: 112 };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
      await Promise.resolve();
    });
    await flushResizeSync();
    expect(resizeHeights().at(-1)).toBe(112 + WITH_PREVIEW_TOP_HEADROOM_PX);

    measuredFrame = { width: 200, height: 78 };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove screenshot 1' }));
      await Promise.resolve();
    });
    await flushResizeSync();

    expect(resizeHeights().at(-1)).toBe(52);
    jest.useRealTimers();
  });

  test('updates with-preview cached height when re-entering preview mode with a taller measured frame', async () => {
    jest.useFakeTimers();
    const rafQueue = [];
    global.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    global.cancelAnimationFrame = jest.fn();
    const flushResizeSync = async () => {
      await act(async () => {
        rafQueue.splice(0).forEach((cb) => cb());
        jest.advanceTimersByTime(45);
        await Promise.resolve();
      });
    };
    const resizeHeights = () => mockInvoke.mock.calls
      .filter(([channel]) => channel === 'set-chatbox-size')
      .map(([, payload]) => payload?.height);
    let measuredFrame = { width: 200, height: 52 };
    mockGetRoundedFrameSize.mockImplementation(() => measuredFrame);

    render(<ChatBox />);
    await flushResizeSync();
    expect(resizeHeights().at(-1)).toBe(52);

    measuredFrame = { width: 200, height: 104 };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
      await Promise.resolve();
    });
    await flushResizeSync();
    expect(resizeHeights().at(-1)).toBe(104 + WITH_PREVIEW_TOP_HEADROOM_PX);

    measuredFrame = { width: 200, height: 132 };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove screenshot 1' }));
      await Promise.resolve();
    });
    await flushResizeSync();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
      await Promise.resolve();
    });
    await flushResizeSync();
    expect(resizeHeights().at(-1)).toBe(132 + WITH_PREVIEW_TOP_HEADROOM_PX);
    jest.useRealTimers();
  });

  test('does not apply compact transition lock while in with-preview mode', async () => {
    jest.useFakeTimers();
    const rafQueue = [];
    global.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    global.cancelAnimationFrame = jest.fn();
    const originalResizeObserver = global.ResizeObserver;
    const observerCallbacks = [];
    global.ResizeObserver = class ResizeObserverMock {
      constructor(callback) {
        observerCallbacks.push(callback);
      }

      observe() {}

      disconnect() {}
    };
    const flushResizeSync = async () => {
      await act(async () => {
        rafQueue.splice(0).forEach((cb) => cb());
        jest.advanceTimersByTime(45);
        await Promise.resolve();
      });
    };
    const resizeHeights = () => mockInvoke.mock.calls
      .filter(([channel]) => channel === 'set-chatbox-size')
      .map(([, payload]) => payload?.height);
    let measuredFrame = { width: 200, height: 52 };
    mockGetRoundedFrameSize.mockImplementation(() => measuredFrame);

    try {
      render(<ChatBox />);
      await flushResizeSync();
      expect(resizeHeights().at(-1)).toBe(52);

      measuredFrame = { width: 200, height: 88 };
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
        await Promise.resolve();
      });
      await flushResizeSync();
      expect(resizeHeights().at(-1)).toBe(88 + WITH_PREVIEW_TOP_HEADROOM_PX);

      measuredFrame = { width: 200, height: 132 };
      await act(async () => {
        observerCallbacks.forEach((callback) => callback());
      });
      await flushResizeSync();
      expect(resizeHeights().at(-1)).toBe(132 + WITH_PREVIEW_TOP_HEADROOM_PX);
    } finally {
      global.ResizeObserver = originalResizeObserver;
      jest.useRealTimers();
    }
  });

  test('uses shell scrollHeight when it exceeds rounded frame height in preview mode', async () => {
    jest.useFakeTimers();
    const rafQueue = [];
    global.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    global.cancelAnimationFrame = jest.fn();
    const flushResizeSync = async () => {
      await act(async () => {
        rafQueue.splice(0).forEach((cb) => cb());
        jest.advanceTimersByTime(45);
        await Promise.resolve();
      });
    };
    const resizeHeights = () => mockInvoke.mock.calls
      .filter(([channel]) => channel === 'set-chatbox-size')
      .map(([, payload]) => payload?.height);
    let measuredFrame = { width: 200, height: 52 };
    mockGetRoundedFrameSize.mockImplementation(() => measuredFrame);

    const { container } = render(<ChatBox />);
    const shell = container.querySelector('.chatbox-shell');
    expect(shell).toBeTruthy();

    Object.defineProperty(shell, 'scrollHeight', {
      value: 52,
      configurable: true,
    });
    await flushResizeSync();
    expect(resizeHeights().at(-1)).toBe(52);

    Object.defineProperty(shell, 'scrollHeight', {
      value: 120,
      configurable: true,
    });
    measuredFrame = { width: 200, height: 88 };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
      await Promise.resolve();
    });
    await flushResizeSync();

    expect(resizeHeights().at(-1)).toBe(120 + WITH_PREVIEW_TOP_HEADROOM_PX);
    jest.useRealTimers();
  });

  test('wires overlay sender surface for centralized UI send behavior', () => {
    render(<ChatBox />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(undefined, {
      senderSurface: 'overlay-chatbox',
    });
  });

  test('settings button opens and maximizes the dashboard window', () => {
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Open dashboard' }));

    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'show-main-window'
        && payload?.maximize === true
        && payload?.open === 'chat',
    );
  });

  test('does not render compaction control when dev UI flag is disabled', () => {
    render(<ChatBox />);
    expect(screen.queryByRole('button', { name: 'Run auto compaction' })).not.toBeInTheDocument();
  });

  test('renders dev compaction control and dispatches compact-history', () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Run auto compaction' }));
    expect(mockCompactHistory).toHaveBeenCalledWith(true);
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

  test('auto-focuses input when chatbox window gains focus', () => {
    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me anything...');

    input.blur();
    fireEvent.focus(window);
    expect(document.activeElement).toBe(input);
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

  test('does not start wakeword STT voice mode when setting is disabled', () => {
    render(<ChatBox />);

    const wakewordSttHandler = mockListeners.get('wakeword-stt-trigger');
    expect(wakewordSttHandler).toEqual(expect.any(Function));

    act(() => {
      wakewordSttHandler();
    });

    const enabledArgs = mockUseVoiceMode.mock.calls.map((args) => args[0]);
    expect(enabledArgs[enabledArgs.length - 1]).toBe(false);
  });

  test('text-to-speech button toggles speech mode config', () => {
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle text-to-speech' }));
    expect(mockUpdateConfig).toHaveBeenCalledWith({ speech_mode_enabled: true });
  });

  test('does not render active app label inside chatbox pill surface', () => {
    const { container } = render(<ChatBox />);
    expect(container.querySelector('.chatbox-context-indicator')).toBeNull();
    expect(screen.queryByLabelText(/Active app:/i)).not.toBeInTheDocument();
  });
});
