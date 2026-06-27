/**
 * Covers chat box overlay mouse ignore. behavior in the frontend test suite.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import MinimalChatPill from '../../src/renderer/features/minimalChatPill/components/MinimalChatPill';

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
const mockUpdateSettings = jest.fn();
const mockStopQuery = jest.fn();
const mockIsDevUiEnabled = jest.fn(() => false);
const mockSetThinkingStatus = jest.fn();
const mockSetThinkingSourceEventType = jest.fn();
const mockSetActiveConversationRef = jest.fn();
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

function createPointerEvent(type, options = {}) {
  const PointerEventCtor = window.PointerEvent || window.MouseEvent;
  return new PointerEventCtor(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    screenX: 0,
    screenY: 0,
    pointerId: 1,
    pointerType: 'mouse',
    ...options,
  });
}

function createPointerDownEvent(options = {}) {
  return createPointerEvent('pointerdown', options);
}

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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
    DESKTOP_RUNTIME_PENDING_TURN: 'windie:pending-turn',
  },
  INVOKE_CHANNELS: {
    SET_CHATBOX_VISUAL_ANCHOR_HEIGHT: 'set-chatbox-visual-anchor-height',
    SET_CHATBOX_HIT_TEST_ACTIVE: 'set-chatbox-hit-test-active',
    ACTIVATE_CHATBOX_TEXT_ENTRY: 'activate-chatbox-text-entry',
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
  activeConversationRef: 'conv-overlay',
  workspaces: {},
  thinkingStatus: null,
  setThinkingStatus: (...args) => mockSetThinkingStatus(...args),
  setThinkingSourceEventType: (...args) => mockSetThinkingSourceEventType(...args),
  setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
  streamTracking: { phase: 'idle' },
  sdkLiveTurn: null,
  conversationView: null,
  pendingTurn: null,
};

function syncMockWorkspace() {
  mockChatState.workspaces = {
    ...mockChatState.workspaces,
    [mockChatState.activeConversationRef]: {
      messages: mockChatState.messages,
      isSending: false,
      thinkingStatus: mockChatState.thinkingStatus,
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: null,
      streamTracking: mockChatState.streamTracking,
      sdkLiveTurn: mockChatState.sdkLiveTurn,
      conversationView: mockChatState.conversationView,
      pendingTurn: mockChatState.pendingTurn,
    },
  };
}

function setMockConversationView({
  conversationRef = 'conv-overlay',
  turnRef = 'turn-active',
  phase = 'streaming',
} = {}) {
  mockChatState.conversationView = {
    conversationRef,
    revisionId: 'rev-overlay',
    displayRows: [],
    liveTurn: {
      turnRef,
      phase,
      entries: [{ id: 'entry-active', text: 'active stream' }],
      isBusy: true,
      isTerminal: false,
      canStop: true,
      lastError: null,
    },
    surfaces: {
      pill: { mode: 'busy' },
      dashboard: { mode: 'busy' },
      responseOverlay: {
        mode: 'response',
        visible: true,
        guardRef: turnRef,
        ownerConversationRef: conversationRef,
        turnRef,
      },
    },
    actions: {
      canEdit: true,
      canRetry: true,
      canFork: true,
    },
  };
  syncMockWorkspace();
}

let mockConfig = {
  interaction_mode: 'chat',
  wakeword_stt_enabled: false,
  speech_mode_enabled: false,
  include_query_screenshot: true,
};

jest.mock('../../src/renderer/features/chat/stores/chatStore', () => ({
  ...(() => {
    const useChatStore = (selector) =>
      require('./storeSelectorTestUtils.cjs').selectMockStoreState(selector, mockChatState);
    useChatStore.setState = (update) => {
      const nextState = typeof update === 'function' ? update(mockChatState) : update;
      if (nextState && typeof nextState === 'object') {
        Object.assign(mockChatState, nextState);
      }
    };
    return {
      selectLiveTurnSurfaceState: (
        jest.requireActual('../../src/renderer/features/chat/stores/chatStore')
          .selectLiveTurnSurfaceState
      ),
      useChatStore,
      setThinkingStatusInChatStore: (...args) => mockSetThinkingStatus(...args),
      setThinkingSourceEventTypeInChatStore: (...args) => mockSetThinkingSourceEventType(...args),
    };
  })(),
}));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => ({
    config: mockConfig,
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../src/renderer/features/voice/hooks/useVoiceMode', () => ({
  useVoiceMode: (...args) => mockUseVoiceMode(...args),
}));

jest.mock('../../src/renderer/features/chat/hooks/useChatMessageSender', () => ({
  useChatMessageSender: (...args) => mockUseChatMessageSender(...args),
}));

jest.mock('../../src/renderer/features/chat/session/useRendererConversationSessionInfo', () => ({
  useRendererConversationSessionInfo: () => ({
    conversationRef: mockChatState.activeConversationRef,
    userId: null,
  }),
}));

jest.mock('../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
    stop: (...args) => mockStopQuery(...args),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    compactHistory: (...args) => mockCompactHistory(...args),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopDevUiRuntime', () => ({
  DesktopDevUiRuntime: {
    isDevUiEnabled: () => mockIsDevUiEnabled(),
  },
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
    mockUpdateSettings.mockClear();
    mockStopQuery.mockClear();
    mockSetThinkingStatus.mockClear();
    mockSetThinkingSourceEventType.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockIsDevUiEnabled.mockReset();
    mockIsDevUiEnabled.mockReturnValue(false);
    mockConfig = {
      interaction_mode: 'chat',
      wakeword_stt_enabled: false,
      speech_mode_enabled: false,
      include_query_screenshot: true,
    };
    mockChatState.activeConversationRef = 'conv-overlay';
    mockChatState.messages = [];
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.sdkLiveTurn = null;
    mockChatState.conversationView = null;
    mockChatState.pendingTurn = null;
    mockChatState.workspaces = {};
    syncMockWorkspace();
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
    const { container } = render(<MinimalChatPill />);
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
    const { container } = render(<MinimalChatPill />);
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
    render(<MinimalChatPill />);
    emitOverlayPhase('streaming');

    const enabledClickThrough = mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-overlay-ignore-mouse' && payload?.ignore === true,
    );
    expect(enabledClickThrough).toBe(false);
    expect(screen.getByRole('button', { name: 'Open config' })).toBeEnabled();
  });

  test('reports pointer-scoped pill interactivity to main-owned hit-testing runtime', async () => {
    const { container } = render(<MinimalChatPill />);
    const pill = container.querySelector('.chatbox-pill');
    Object.defineProperty(pill, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 70,
        height: 56,
        left: 0,
        right: 520,
        top: 14,
        width: 520,
        x: 0,
        y: 14,
      }),
    });

    await act(async () => {
      await Promise.resolve();
    });
    mockInvoke.mockClear();

    await act(async () => {
      fireEvent.mouseMove(window, { clientX: 260, clientY: 42 });
      fireEvent.mouseMove(window, { clientX: 260, clientY: 4 });
      await Promise.resolve();
    });

    expect(mockInvoke.mock.calls.some(
      ([channel, payload]) => channel === 'set-chatbox-hit-test-active' && payload?.active === true,
    )).toBe(true);
    expect(mockInvoke.mock.calls.filter(
      ([channel, payload]) => channel === 'set-chatbox-hit-test-active' && payload?.active === false,
    )).toHaveLength(1);
  });

  test('camera toggle starts enabled by default and does not create a preview row when clicked', async () => {
    const { container } = render(<MinimalChatPill />);
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
    const { container } = render(<MinimalChatPill />);
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
    const { rerender } = render(<MinimalChatPill />);

    let cameraButton = screen.getByRole('button', { name: 'Toggle auto screenshot' });
    expect(cameraButton.classList.contains('is-enabled')).toBe(false);
    expect(cameraButton).toHaveAttribute('title', 'Enable auto screenshot');

    fireEvent.click(cameraButton);
    expect(mockUpdateConfig).toHaveBeenCalledWith({ include_query_screenshot: true });

    mockConfig = {
      ...mockConfig,
      include_query_screenshot: true,
    };
    rerender(<MinimalChatPill />);

    cameraButton = screen.getByRole('button', { name: 'Toggle auto screenshot' });
    expect(cameraButton.classList.contains('is-enabled')).toBe(true);
    expect(cameraButton).toHaveAttribute('title', 'Disable auto screenshot');
  });

  test('wires overlay sender surface for centralized UI send behavior', () => {
    render(<MinimalChatPill />);

    expect(mockUseChatMessageSender).toHaveBeenCalledWith(undefined, {
      senderSurface: 'overlay-chatbox',
    });
  });

  test('dispatches pill send path without private busy latch', async () => {
    mockChatState.sdkLiveTurn = {
      phase: 'complete',
      turnRef: 'previous-turn',
      presentation: {
        typingVisible: false,
        overlayVisible: false,
        isBusy: false,
      },
    };
    syncMockWorkspace();
    render(<MinimalChatPill />);

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'Start immediately' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    expect(mockSendMessage).toHaveBeenCalledWith('Start immediately');
    expect(mockSetThinkingStatus).not.toHaveBeenCalled();
    expect(mockSetThinkingSourceEventType).not.toHaveBeenCalled();
  });

  test('config button opens and maximizes the dashboard on the chat surface', () => {
    render(<MinimalChatPill />);

    fireEvent.click(screen.getByRole('button', { name: 'Open config' }));

    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'show-main-window'
        && payload?.maximize === true
        && payload?.open === 'chat'
        && payload?.reason === 'chat-pill-settings',
    );
  });

  test('keeps pill controls interactive during active loop phases and shows stop', async () => {
    setMockConversationView({
      conversationRef: 'conv-overlay',
      turnRef: 'turn-active',
    });
    render(<MinimalChatPill />);

    expect(screen.getByRole('button', { name: 'Open config' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Hide chat pill' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Toggle text-to-speech' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Toggle auto screenshot' })).toBeEnabled();
    expect(screen.getByPlaceholderText('Ask me to do anything...')).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Open config' }));
    expectInvokeCall(([channel]) => channel === 'show-main-window');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    });
    expect(mockStopQuery).toHaveBeenCalledWith('conv-overlay', 'turn-active');
  });

  test('stop targets the current-turn conversation when pill session ref is stale', async () => {
    mockChatState.activeConversationRef = 'conv-stale-session';
    setMockConversationView({
      conversationRef: 'conv-visible-turn',
      turnRef: 'turn-visible',
    });
    render(<MinimalChatPill />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    });

    expect(mockStopQuery).toHaveBeenCalledWith('conv-visible-turn', 'turn-visible');
  });

  test('does not render compaction control when dev UI flag is disabled', () => {
    render(<MinimalChatPill />);
    expect(screen.queryByRole('button', { name: 'Run auto compaction' })).not.toBeInTheDocument();
  });

  test('renders dev compaction control and dispatches compact-history', async () => {
    mockIsDevUiEnabled.mockReturnValue(true);
    render(<MinimalChatPill />);

    fireEvent.click(screen.getByRole('button', { name: 'Run auto compaction' }));
    expect(mockChatState.workspaces['conv-overlay']).toEqual(expect.objectContaining({
      thinkingStatus: 'Compacting conversation history...',
      thinkingSourceEventType: 'context-compaction-started',
    }));
    await flushAnimationFrames();
    await waitFor(() => {
      expect(mockCompactHistory).toHaveBeenCalledWith(true, 'conv-overlay');
    });
  });

  test('dragging pill sends absolute move-chatbox-to coordinates', () => {
    setWindowScreenPosition(90, 90);

    const { container } = render(<MinimalChatPill />);
    const pill = container.querySelector('.chatbox-pill');
    expect(pill).toBeTruthy();

    fireEvent.mouseDown(pill, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 18, clientY: 20, screenX: 110, screenY: 118 });
    fireEvent.mouseUp(window);

    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 100, y: 108 });
  });

  test('input drag starts chat pill movement after the movement threshold', () => {
    setWindowScreenPosition(90, 90);

    render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    fireEvent.mouseDown(input, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 34, clientY: 30, screenX: 140, screenY: 130 });
    fireEvent.mouseUp(window);

    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 130, y: 120 });
  });

  test('unfocused input pointer drag still starts chat pill movement', () => {
    setWindowScreenPosition(90, 90);

    render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    const pointerDown = createPointerDownEvent({
      clientX: 10,
      clientY: 10,
      screenX: 100,
      screenY: 100,
    });
    const preventDefaultSpy = jest.spyOn(pointerDown, 'preventDefault');

    input.dispatchEvent(pointerDown);
    window.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 34,
      clientY: 30,
      screenX: 140,
      screenY: 130,
    }));
    window.dispatchEvent(createPointerEvent('pointerup'));

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'activate-chatbox-text-entry'
        && payload?.reason === 'text-entry',
    );
    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 130, y: 120 });
    expect(document.activeElement).not.toBe(input);
    preventDefaultSpy.mockRestore();
  });

  test('button drag also starts chat pill movement after the movement threshold', () => {
    setWindowScreenPosition(90, 90);

    render(<MinimalChatPill />);
    const configButton = screen.getByRole('button', { name: 'Open config' });

    fireEvent.mouseDown(configButton, { button: 0, clientX: 10, clientY: 10, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(window, { clientX: 26, clientY: 18, screenX: 120, screenY: 116 });
    fireEvent.mouseUp(window);

    expect(mockSend).toHaveBeenCalledWith('move-chatbox-to', { x: 110, y: 106 });
  });

  test('simple button click still triggers dashboard chat-surface open when no drag occurs', () => {
    render(<MinimalChatPill />);

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

  test('does not auto-focus input on passive mount', () => {
    render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    expect(document.activeElement).not.toBe(input);
  });

  test('requests native text-entry activation before showing caret', () => {
    render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    const pointerDown = createPointerDownEvent();
    const preventDefaultSpy = jest.spyOn(pointerDown, 'preventDefault');

    input.dispatchEvent(pointerDown);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expectInvokeCall(
      ([channel, payload]) =>
        channel === 'activate-chatbox-text-entry'
        && payload?.reason === 'text-entry',
    );
    expect(document.activeElement).not.toBe(input);
    preventDefaultSpy.mockRestore();
  });

  test('responds only to explicit chatbox-focus events and ignores generic window focus churn', () => {
    render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    input.blur();
    fireEvent.focus(window);
    expect(document.activeElement).not.toBe(input);

    act(() => {
      mockListeners.get('chatbox-focus')?.();
    });
    expect(document.activeElement).toBe(input);
  });

  test('allows normal textarea pointer placement after main-owned focus is active', () => {
    render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');

    act(() => {
      mockListeners.get('chatbox-focus')?.();
    });

    const pointerDown = createPointerDownEvent();
    const preventDefaultSpy = jest.spyOn(pointerDown, 'preventDefault');

    input.dispatchEvent(pointerDown);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expectInvokeCall(
      ([channel]) => channel === 'activate-chatbox-text-entry',
    );
    preventDefaultSpy.mockRestore();
  });

  test('focuses input from chatbox-focus while active loop keeps pill interactive', async () => {
    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv-overlay',
      phase: 'tool_call',
      turnRef: 'turn-active',
    };
    syncMockWorkspace();
    const { container } = render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');
    await waitFor(() => {
      const shellWrap = container.querySelector('.chatbox-shell-wrap');
      expect(shellWrap?.classList.contains('loop-active')).toBe(true);
    });
    expect(input).toBeEnabled();
    input.blur();
    await act(async () => {
      await Promise.resolve();
    });
    const focusSpy = jest.spyOn(input, 'focus');

    act(() => {
      mockListeners.get('chatbox-focus')?.();
    });
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  test('adds ambient loop glow class while active overlay phases are running', () => {
    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv-overlay',
      phase: 'tool_call',
      turnRef: 'turn-active',
    };
    syncMockWorkspace();
    const { container, rerender } = render(<MinimalChatPill />);
    const shellWrap = container.querySelector('.chatbox-shell-wrap');
    expect(shellWrap).toBeTruthy();

    expect(shellWrap.classList.contains('loop-active')).toBe(true);

    mockChatState.sdkLiveTurn = {
      conversationRef: 'conv-overlay',
      phase: 'complete',
      turnRef: 'turn-active',
    };
    syncMockWorkspace();
    rerender(<MinimalChatPill />);
    expect(shellWrap.classList.contains('loop-active')).toBe(false);
  });

  test('send button dispatches message and clears input', async () => {
    render(<MinimalChatPill />);
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
    render(<MinimalChatPill />);
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

  test('marks the pill expanded only while the composer is taller than compact height', async () => {
    const { container } = render(<MinimalChatPill />);
    const input = screen.getByPlaceholderText('Ask me to do anything...');
    const shellWrap = container.querySelector('.chatbox-input-shell-wrap');
    const pill = container.querySelector('.chatbox-pill');

    expect(shellWrap?.classList.contains('is-composer-expanded')).toBe(false);
    expect(pill?.classList.contains('is-composer-expanded')).toBe(false);

    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      value: 72,
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'line one\nline two' } });
      await Promise.resolve();
    });

    expect(shellWrap?.classList.contains('is-composer-expanded')).toBe(true);
    expect(pill?.classList.contains('is-composer-expanded')).toBe(true);

    Object.defineProperty(input, 'scrollHeight', {
      configurable: true,
      value: 34,
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
      await Promise.resolve();
    });

    expect(shellWrap?.classList.contains('is-composer-expanded')).toBe(false);
    expect(pill?.classList.contains('is-composer-expanded')).toBe(false);
  });

  test('accepts pasted images and sends them through the shared outgoing payload contract', async () => {
    render(<MinimalChatPill />);
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
    render(<MinimalChatPill />);
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
    render(<MinimalChatPill />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide chat pill' }));
    });

    expectInvokeCall(([channel, payload]) => (
      channel === 'hide-chatbox'
      && payload?.reason === 'user'
    ));
  });

  test('renders stop button during active stream', async () => {
    setMockConversationView({
      conversationRef: 'conv-overlay',
      turnRef: 'turn-active',
    });
    render(<MinimalChatPill />);

    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    const stopButton = screen.getByRole('button', { name: 'Stop response' });
    expect(stopButton).toBeEnabled();
    await act(async () => {
      fireEvent.click(stopButton);
    });
    expect(mockStopQuery).toHaveBeenCalledWith('conv-overlay', 'turn-active');
  });

  test('renders stop button from pending turn before first stream event', async () => {
    mockChatState.streamTracking.phase = 'idle';
    mockChatState.pendingTurn = {
      conversationRef: 'conv-overlay',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'pending',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
    };
    syncMockWorkspace();
    render(<MinimalChatPill />);

    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    const stopButton = screen.getByRole('button', { name: 'Stop response' });
    expect(stopButton).toBeEnabled();
    await act(async () => {
      fireEvent.click(stopButton);
    });
    expect(mockStopQuery).toHaveBeenCalledWith('conv-overlay', 'turn-pending');
    expect(mockChatState.workspaces['conv-overlay']).toEqual(expect.objectContaining({
      pendingTurn: null,
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      streamTracking: expect.objectContaining({
        phase: 'complete',
        lastEventType: 'stop-query',
      }),
    }));
  });

  test('does not start wakeword STT voice mode when setting is disabled', () => {
    render(<MinimalChatPill />);

    const wakewordSttHandler = mockListeners.get('wakeword-stt-trigger');
    expect(wakewordSttHandler).toEqual(expect.any(Function));

    act(() => {
      wakewordSttHandler();
    });

    const enabledArgs = mockUseVoiceMode.mock.calls.map((args) => args[0]);
    expect(enabledArgs[enabledArgs.length - 1]).toBe(false);
  });

  test('text-to-speech button toggles speech mode config', () => {
    render(<MinimalChatPill />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle text-to-speech' }));
    expect(mockUpdateConfig).toHaveBeenCalledWith({ speech_mode_enabled: true });
  });

  test('does not render active app label inside chatbox pill surface', () => {
    const { container } = render(<MinimalChatPill />);
    expect(container.querySelector('.chatbox-context-indicator')).toBeNull();
    expect(screen.queryByLabelText(/Active app:/i)).not.toBeInTheDocument();
  });
});
