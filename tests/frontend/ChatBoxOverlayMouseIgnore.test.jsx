import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import ChatBox from '../../frontend/src/renderer/features/chat/components/ChatBox';

const FILE_READER_DATA_URL = 'data:image/png;base64,ZmFrZS1jaGF0Ym94LWltYWdl';
const FILE_READER_BASE64 = 'ZmFrZS1jaGF0Ym94LWltYWdl';
const mockInvoke = jest.fn(() => Promise.resolve({ success: true }));
const mockSend = jest.fn();
const mockListeners = new Map();
const mockSendMessage = jest.fn();
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
const mockStopQuery = jest.fn();
const mockIsDevUiEnabled = jest.fn(() => false);
const mockSetThinkingStatus = jest.fn();
const mockSetThinkingSourceEventType = jest.fn();
const mockSetIsSending = jest.fn();
const mockUpdateStreamTracking = jest.fn();
const originalFileReader = global.FileReader;
const originalResizeObserver = global.ResizeObserver;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const resizeObserverInstances = [];
const requestAnimationFrameCallbacks = new Map();
let nextAnimationFrameId = 1;

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

const emitOverlayPhase = (phase) => {
  act(() => {
    mockListeners.get('response-overlay-phase')?.({ phase });
  });
};

function buildImagePasteEvent(itemCount = 1) {
  return {
    clipboardData: {
      getData: jest.fn(() => ''),
      items: Array.from({ length: itemCount }).map(() => ({
        type: 'image/png',
        getAsFile: () => new Blob(['image'], { type: 'image/png' }),
      })),
    },
  };
}

async function flushAnimationFrames() {
  const queuedCallbacks = Array.from(requestAnimationFrameCallbacks.values());
  requestAnimationFrameCallbacks.clear();
  queuedCallbacks.forEach((callback) => callback(0));
  await Promise.resolve();
}

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
    SET_CHATBOX_VISUAL_ANCHOR_HEIGHT: 'set-chatbox-visual-anchor-height',
    SET_CHATBOX_HIT_TEST_ACTIVE: 'set-chatbox-hit-test-active',
    SHOW_MAIN_WINDOW: 'show-main-window',
    HIDE_CHATBOX: 'hide-chatbox',
  },
  ON_CHANNELS: {
    CHATBOX_FOCUS: 'chatbox-focus',
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
    WAKEWORD_STT_TRIGGER: 'wakeword-stt-trigger',
  },
}));

const mockChatState = {
  messages: [],
  isSending: false,
  activeConversationRef: 'conv-overlay',
  thinkingStatus: null,
  setThinkingStatus: (...args) => mockSetThinkingStatus(...args),
  setThinkingSourceEventType: (...args) => mockSetThinkingSourceEventType(...args),
  setIsSending: (...args) => mockSetIsSending(...args),
  updateStreamTracking: (...args) => mockUpdateStreamTracking(...args),
  streamTracking: { phase: 'idle' },
};

let mockConfig = {
  interaction_mode: 'chat',
  wakeword_stt_enabled: false,
  speech_mode_enabled: false,
  include_query_screenshot: true,
};

jest.mock('../../frontend/src/renderer/features/chat/stores/chatStore', () => ({
  useChatStore: (selector) =>
    require('./storeSelectorTestUtils.cjs').selectMockStoreState(selector, mockChatState),
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: mockConfig,
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../frontend/src/renderer/features/voice/hooks/useVoiceMode', () => ({
  useVoiceMode: (...args) => mockUseVoiceMode(...args),
}));

jest.mock('../../frontend/src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: (...args) => mockUseChatMessageSender(...args),
}));

jest.mock('../../frontend/src/renderer/features/chat/session/useRendererConversationSessionInfo', () => ({
  useRendererConversationSessionInfo: () => ({
    conversationRef: mockChatState.activeConversationRef,
    userId: null,
  }),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    compactHistory: (...args) => mockCompactHistory(...args),
    stopQuery: (...args) => mockStopQuery(...args),
  },
}));

jest.mock('../../frontend/src/renderer/features/chat/utils/devUiFlag', () => ({
  isDevUiEnabled: () => mockIsDevUiEnabled(),
}));

describe('ChatBox overlay mouse ignore', () => {
  beforeEach(() => {
    global.FileReader = class MockFileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
      }

      readAsDataURL() {
        this.result = FILE_READER_DATA_URL;
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    };
    mockInvoke.mockClear();
    mockSend.mockClear();
    mockListeners.clear();
    mockUseChatMessageSender.mockClear();
    mockUseVoiceMode.mockClear();
    mockUpdateConfig.mockClear();
    mockSendMessage.mockClear();
    mockCompactHistory.mockClear();
    mockStopQuery.mockClear();
    mockSetThinkingStatus.mockClear();
    mockSetThinkingSourceEventType.mockClear();
    mockSetIsSending.mockClear();
    mockUpdateStreamTracking.mockClear();
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
    mockConfig = {
      interaction_mode: 'chat',
      wakeword_stt_enabled: false,
      speech_mode_enabled: false,
      include_query_screenshot: true,
    };
    mockChatState.activeConversationRef = 'conv-overlay';
    mockChatState.isSending = false;
    mockChatState.messages = [];
    mockChatState.streamTracking.phase = 'idle';
    resizeObserverInstances.length = 0;
    requestAnimationFrameCallbacks.clear();
    nextAnimationFrameId = 1;
    global.ResizeObserver = class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        resizeObserverInstances.push(this);
      }

      observe() {}

      disconnect() {}
    };
    window.requestAnimationFrame = (callback) => {
      const id = nextAnimationFrameId += 1;
      requestAnimationFrameCallbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      requestAnimationFrameCallbacks.delete(id);
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    global.FileReader = originalFileReader;
    global.ResizeObserver = originalResizeObserver;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test('does not manage overlay click-through from the renderer and avoids live window resize', () => {
    const { container } = render(<ChatBox />);
    const shellWrap = container.querySelector('.chatbox-input-shell-wrap');

    expect(shellWrap?.style.getPropertyValue('--chatbox-bump-height')).toBe('14px');
    const sawRendererMouseToggle = mockInvoke.mock.calls.some(
      ([channel]) => channel === 'set-overlay-ignore-mouse',
    );
    expect(sawRendererMouseToggle).toBe(false);
    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-chatbox-visual-anchor-height' && payload?.height === 64,
    )).toBe(true);
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'set-chatbox-size')).toBe(false);
  });

  test('reports multiline shell growth through visual anchor height updates', async () => {
    const { container } = render(<ChatBox />);
    const shell = container.querySelector('.chatbox-shell');

    expect(shell).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    mockInvoke.mockClear();

    Object.defineProperty(shell, 'offsetHeight', {
      configurable: true,
      value: 90,
    });

    await act(async () => {
      resizeObserverInstances.forEach((observer) => observer.callback());
      Object.defineProperty(shell, 'offsetHeight', {
        configurable: true,
        value: 94,
      });
      resizeObserverInstances.forEach((observer) => observer.callback());
      await new Promise((resolve) => {
        window.setTimeout(resolve, 140);
      });
      await flushAnimationFrames();
      await Promise.resolve();
    });

    const anchorHeightCalls = mockInvoke.mock.calls.filter(
      ([channel]) => channel === 'set-chatbox-visual-anchor-height',
    );
    expect(anchorHeightCalls.at(-1)?.[1]?.height).toBe(88);
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'set-chatbox-size')).toBe(false);
  });

  test('does not enable click-through from response overlay phase activity', () => {
    render(<ChatBox />);
    emitOverlayPhase('streaming');

    const enabledClickThrough = mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-overlay-ignore-mouse' && payload?.ignore === true,
    );
    expect(enabledClickThrough).toBe(false);
  });

  test('reports pill hover state to main-owned hit-testing runtime', async () => {
    const { container } = render(<ChatBox />);
    const pill = container.querySelector('.chatbox-pill');

    await act(async () => {
      fireEvent.mouseEnter(pill);
      fireEvent.mouseLeave(pill);
      await Promise.resolve();
    });

    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-chatbox-hit-test-active' && payload?.active === true,
    )).toBe(true);
    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-chatbox-hit-test-active' && payload?.active === false,
    )).toBe(true);
  });

  test('camera toggle starts enabled by default and does not create a preview row when clicked', async () => {
    const { container } = render(<ChatBox />);
    const shellWrap = container.querySelector('.chatbox-input-shell-wrap');
    const pill = container.querySelector('.chatbox-pill');
    const previewRow = container.querySelector('.chatbox-image-preview-row');
    const cameraButton = screen.getByRole('button', { name: 'Toggle auto screenshot' });

    expect(cameraButton.classList.contains('is-enabled')).toBe(true);
    expect(shellWrap?.classList.contains('with-preview')).toBe(false);
    expect(pill?.classList.contains('with-preview')).toBe(false);
    expect(previewRow).toBeTruthy();
    expect(previewRow.classList.contains('has-items')).toBe(false);

    await act(async () => {
      fireEvent.click(cameraButton);
      await Promise.resolve();
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith({ include_query_screenshot: false });
    expect(shellWrap?.classList.contains('with-preview')).toBe(false);
    expect(pill?.classList.contains('with-preview')).toBe(false);
    expect(previewRow.classList.contains('has-items')).toBe(false);
    expect(screen.queryByRole('button', { name: /Remove screenshot/i })).not.toBeInTheDocument();
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

  test('camera toggle reflects disabled state and can request re-enable', () => {
    mockConfig = {
      ...mockConfig,
      include_query_screenshot: false,
    };
    const { rerender } = render(<ChatBox />);

    let cameraButton = screen.getByRole('button', { name: 'Toggle auto screenshot' });
    expect(cameraButton.classList.contains('is-enabled')).toBe(false);
    expect(cameraButton).toHaveAttribute('title', 'Enable auto screenshot');

    fireEvent.click(cameraButton);
    expect(mockUpdateConfig).toHaveBeenCalledWith({ include_query_screenshot: true });

    mockConfig = {
      ...mockConfig,
      include_query_screenshot: true,
    };
    rerender(<ChatBox />);

    cameraButton = screen.getByRole('button', { name: 'Toggle auto screenshot' });
    expect(cameraButton.classList.contains('is-enabled')).toBe(true);
    expect(cameraButton).toHaveAttribute('title', 'Disable auto screenshot');
  });

  test('wires overlay sender surface for centralized UI send behavior', () => {
    render(<ChatBox />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(undefined, {
      senderSurface: 'overlay-chatbox',
    });
  });

  test('config button opens and maximizes the dashboard on the chat surface', () => {
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Open config' }));

    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'show-main-window'
        && payload?.maximize === true
        && payload?.open === 'chat',
    );
  });

  test('locks pill controls during active loop phases and leaves send disabled', () => {
    render(<ChatBox />);
    emitOverlayPhase('streaming');

    expect(screen.getByRole('button', { name: 'Open config' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hide chat pill' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Toggle text-to-speech' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Toggle auto screenshot' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Ask me to do anything...')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Open config' }));
    expect(mockInvoke.mock.calls.some(([channel]) => channel === 'show-main-window')).toBe(false);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument();
  });

  test('does not render compaction control when dev UI flag is disabled', () => {
    render(<ChatBox />);
    expect(screen.queryByRole('button', { name: 'Run auto compaction' })).not.toBeInTheDocument();
  });

  test('renders dev compaction control and dispatches compact-history', () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    render(<ChatBox />);

    fireEvent.click(screen.getByRole('button', { name: 'Run auto compaction' }));
    expect(mockCompactHistory).toHaveBeenCalledWith(true, 'conv-overlay');
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

  test('input drag starts chat pill movement after the movement threshold', () => {
    setWindowScreenPosition(90, 90);

    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    fireEvent.mouseDown(input, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 34, clientY: 30, screenX: 140, screenY: 130 });
    fireEvent.mouseUp(window);

    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 130, y: 120 });
  });

  test('button drag also starts chat pill movement after the movement threshold', () => {
    setWindowScreenPosition(90, 90);

    render(<ChatBox />);
    const configButton = screen.getByRole('button', { name: 'Open config' });

    fireEvent.mouseDown(configButton, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 26, clientY: 18, screenX: 120, screenY: 116 });
    fireEvent.mouseUp(window);

    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 110, y: 106 });
  });

  test('simple button click still triggers dashboard chat-surface open when no drag occurs', () => {
    render(<ChatBox />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Open config' }), { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Open config' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open config' }));

    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'show-main-window'
        && payload?.maximize === true
        && payload?.open === 'chat',
    );
  });

  test('auto-focuses input on mount', () => {
    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    expect(document.activeElement).toBe(input);
  });

  test('responds only to explicit chatbox-focus events and ignores generic window focus churn', () => {
    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    input.blur();
    fireEvent.focus(window);
    expect(document.activeElement).not.toBe(input);

    act(() => {
      mockListeners.get('chatbox-focus')?.();
    });
    expect(document.activeElement).toBe(input);
  });

  test('does not focus input from chatbox-focus while loop interaction is locked', async () => {
    const { container } = render(<ChatBox />);
    emitOverlayPhase('tool-call');
    const input = screen.getByPlaceholderText('Ask me to do anything...');
    await waitFor(() => {
      const shellWrap = container.querySelector('.chatbox-shell-wrap');
      expect(shellWrap?.classList.contains('loop-active')).toBe(true);
    });
    expect(input).toBeDisabled();
    input.blur();
    await act(async () => {
      await Promise.resolve();
    });
    const focusSpy = jest.spyOn(input, 'focus');

    act(() => {
      mockListeners.get('chatbox-focus')?.();
    });
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  test('adds ambient loop glow class while active overlay phases are running', () => {
    const { container } = render(<ChatBox />);
    const shellWrap = container.querySelector('.chatbox-shell-wrap');
    expect(shellWrap).toBeTruthy();

    emitOverlayPhase('tool-call');
    expect(shellWrap.classList.contains('loop-active')).toBe(true);

    emitOverlayPhase('idle');
    expect(shellWrap.classList.contains('loop-active')).toBe(false);
  });

  test('send button dispatches message and clears input', async () => {
    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');
    fireEvent.change(input, { target: { value: 'hello world' } });
    const sendButton = screen.getByRole('button', { name: 'Send message' });

    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(mockSendMessage).toHaveBeenCalledWith('hello world');
    expect(input).toHaveValue('');
  });

  test('Enter sends while Shift+Enter keeps multiline content in the pill composer', async () => {
    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    fireEvent.change(input, { target: { value: 'line one', selectionStart: 8 } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(mockSendMessage).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'line one\nline two', selectionStart: 17 } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(mockSendMessage).toHaveBeenCalledWith('line one\nline two');
    expect(input).toHaveValue('');
  });

  test('accepts pasted images and sends them through the shared outgoing payload contract', async () => {
    render(<ChatBox />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    await act(async () => {
      fireEvent.paste(input, buildImagePasteEvent());
    });

    expect(screen.getByAltText('Pasted image preview 1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    const [payload] = mockSendMessage.mock.calls.at(-1) || [];
    expect(payload?.text).toBe('Please review the attached files.');
    expect(payload?.clipboardImages).toEqual([
      expect.objectContaining({
        base64: expect.stringContaining(FILE_READER_BASE64),
        contentType: 'image/png',
        filename: 'clipboard-image.png',
      }),
    ]);
  });

  test('supports readable file attachments and attachment-only send from the pill composer', async () => {
    render(<ChatBox />);
    const attachmentInput = screen.getByTestId('chatbox-attachment-input');
    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(textFile, 'path', {
      value: '/tmp/notes.txt',
      configurable: true,
    });

    await act(async () => {
      fireEvent.change(attachmentInput, {
        target: {
          files: [textFile],
        },
      });
    });

    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText('TXT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: 'Please review the attached files.',
      clipboardImages: [],
      readableFiles: [
        expect.objectContaining({
          filePath: '/tmp/notes.txt',
          filename: 'notes.txt',
        }),
      ],
    });
  });

  test('hide button invokes the existing hide-chatbox bridge action', async () => {
    render(<ChatBox />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide chat pill' }));
    });

    expectInvokeCall(([channel]) => channel === 'hide-chatbox');
  });

  test('keeps send button rendered but disabled during active stream', () => {
    render(<ChatBox />);
    emitOverlayPhase('streaming');

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument();
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockSetIsSending).not.toHaveBeenCalled();
    expect(mockUpdateStreamTracking).not.toHaveBeenCalled();
  });

  test('keeps send button disabled when isSending is true before first stream event', () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.isSending = true;
    render(<ChatBox />);

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument();
    expect(mockStopQuery).not.toHaveBeenCalled();
    expect(mockSetIsSending).not.toHaveBeenCalled();
    expect(mockUpdateStreamTracking).not.toHaveBeenCalled();
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
