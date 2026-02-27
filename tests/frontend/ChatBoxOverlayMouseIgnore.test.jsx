import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChatBox from '../../frontend/src/renderer/features/chat/components/ChatBox';

const mockInvoke = jest.fn(() => Promise.resolve({ success: true }));
const mockSend = jest.fn();
const mockListeners = new Map();
const mockSendMessage = jest.fn();
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
const mockSetThinkingStatus = jest.fn();
const mockSetThinkingSourceEventType = jest.fn();

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
  setThinkingStatus: (...args) => mockSetThinkingStatus(...args),
  setThinkingSourceEventType: (...args) => mockSetThinkingSourceEventType(...args),
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
    mockSetThinkingStatus.mockClear();
    mockSetThinkingSourceEventType.mockClear();
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
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

  test('defaults to interactive overlay without requesting live window resize', () => {
    render(<ChatBox />);

    const sawInteractive = mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-overlay-ignore-mouse' && payload?.ignore === false,
    );
    expect(sawInteractive).toBe(true);
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'set-chatbox-size')).toBe(false);
  });

  test('keeps fixed-size preview lane and does not invoke chatbox resize when images change', async () => {
    const { container } = render(<ChatBox />);
    const shellWrap = container.querySelector('.chatbox-input-shell-wrap');
    const pill = container.querySelector('.chatbox-pill');
    const previewRow = container.querySelector('.chatbox-image-preview-row');
    expect(shellWrap?.classList.contains('with-preview')).toBe(false);
    expect(pill?.classList.contains('with-preview')).toBe(false);
    expect(previewRow).toBeTruthy();
    expect(previewRow.classList.contains('has-items')).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
      await Promise.resolve();
    });
    expect(shellWrap?.classList.contains('with-preview')).toBe(true);
    expect(pill?.classList.contains('with-preview')).toBe(true);
    expect(previewRow.classList.contains('has-items')).toBe(true);
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'set-chatbox-size')).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove screenshot 1' }));
      await Promise.resolve();
    });
    expect(shellWrap?.classList.contains('with-preview')).toBe(false);
    expect(pill?.classList.contains('with-preview')).toBe(false);
    expect(previewRow.classList.contains('has-items')).toBe(false);
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'set-chatbox-size')).toBe(false);
  });

  test('keeps compact non-preview classes stable on startup without delayed flips', async () => {
    jest.useFakeTimers();
    const { container } = render(<ChatBox />);
    const shellWrap = container.querySelector('.chatbox-input-shell-wrap');
    const pill = container.querySelector('.chatbox-pill');
    const previewRow = container.querySelector('.chatbox-image-preview-row');

    expect(shellWrap?.classList.contains('with-preview')).toBe(false);
    expect(pill?.classList.contains('with-preview')).toBe(false);
    expect(previewRow?.classList.contains('has-items')).toBe(false);

    await act(async () => {
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      jest.runOnlyPendingTimers();
    });

    expect(shellWrap?.classList.contains('with-preview')).toBe(false);
    expect(pill?.classList.contains('with-preview')).toBe(false);
    expect(previewRow?.classList.contains('has-items')).toBe(false);
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'set-chatbox-size')).toBe(false);
  });

  test('keeps preview-expanded class until last image is removed and stays compact afterward', async () => {
    jest.useFakeTimers();
    const { container } = render(<ChatBox />);
    const shellWrap = container.querySelector('.chatbox-input-shell-wrap');
    const pill = container.querySelector('.chatbox-pill');
    const previewRow = container.querySelector('.chatbox-image-preview-row');
    const initialPreviewNode = previewRow;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
      fireEvent.click(screen.getByRole('button', { name: 'Take screenshot' }));
      await Promise.resolve();
    });

    expect(container.querySelector('.chatbox-image-preview-row')).toBe(initialPreviewNode);
    expect(screen.getByRole('button', { name: 'Remove screenshot 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove screenshot 2' })).toBeInTheDocument();
    expect(shellWrap?.classList.contains('with-preview')).toBe(true);
    expect(pill?.classList.contains('with-preview')).toBe(true);
    expect(previewRow?.classList.contains('has-items')).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove screenshot 1' }));
      await Promise.resolve();
    });

    expect(shellWrap?.classList.contains('with-preview')).toBe(true);
    expect(pill?.classList.contains('with-preview')).toBe(true);
    expect(previewRow?.classList.contains('has-items')).toBe(true);
    expect(screen.getAllByRole('button', { name: /Remove screenshot/i })).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Remove screenshot/i }));
      await Promise.resolve();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      jest.runOnlyPendingTimers();
    });

    expect(shellWrap?.classList.contains('with-preview')).toBe(false);
    expect(pill?.classList.contains('with-preview')).toBe(false);
    expect(previewRow?.classList.contains('has-items')).toBe(false);
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'set-chatbox-size')).toBe(false);
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
