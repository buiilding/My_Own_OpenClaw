/** @jest-environment node */

const { createSurfaceRuntime } = require('../../frontend/src/main/surface_runtime.cjs');

function createWindow({ visible = false, destroyed = false } = {}) {
  return {
    isDestroyed: jest.fn(() => destroyed),
    isVisible: jest.fn(() => visible),
    show: jest.fn(),
    showInactive: jest.fn(),
    hide: jest.fn(),
    focus: jest.fn(),
    setIgnoreMouseEvents: jest.fn(),
    setFocusable: jest.fn(),
    webContents: {
      send: jest.fn(),
    },
  };
}

function createSurfaceDeps() {
  return {
    screen: {},
    getActiveDisplayAffinity: jest.fn(() => null),
    setActiveDisplayAffinity: jest.fn(),
    syncActiveDisplayAffinityForWindow: jest.fn(),
    getOverlayChatWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 520, height: 116 })),
    getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 520, height: 48 })),
    getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 280, height: 26 })),
    contextLabelWidth: 280,
    contextLabelHeight: 26,
    contextLabelOffsetX: 14,
    contextLabelGapAboveChatbox: -6,
    responseGap: 2,
    initialChatVisualAnchorHeight: 64,
    responseOverlayPhaseEnum: {
      IDLE: 'idle',
      AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
      STREAMING: 'streaming',
      TOOL_CALL: 'tool-call',
      TOOL_OUTPUT: 'tool-output',
      COMPLETE: 'complete',
      ERROR: 'error',
    },
    mainWindowOpenTargetChannel: 'main-window-open-target',
    mainWindowOpenTargets: new Set(['chat', 'settings']),
    windowPlatformPolicy: {
      applyContentProtection: jest.fn(),
      applyOverlayWindowPolicy: jest.fn(),
      activateWindowForInteraction: jest.fn(),
    },
    log: jest.fn(),
    warn: jest.fn(),
  };
}

describe('surface_runtime', () => {
  test('owns window state and one-time main-process IPC initialization', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const mainWindow = { id: 'main' };
    const chatWindow = { id: 'chat' };

    runtime.setMainWindow(mainWindow);
    runtime.setChatWindow(chatWindow);

    expect(runtime.getWindows()).toEqual(expect.objectContaining({
      mainWindow,
      chatWindow,
      responseWindow: null,
      contextLabelWindow: null,
    }));

    const initializer = jest.fn();
    expect(runtime.initializeMainProcessIpcOnce(initializer)).toBe(true);
    expect(runtime.initializeMainProcessIpcOnce(initializer)).toBe(false);
    expect(initializer).toHaveBeenCalledTimes(1);
  });

  test('allows main-process IPC initialization retry after initializer failure', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const failingInitializer = jest.fn(() => {
      throw new Error('registration failed');
    });
    const successfulInitializer = jest.fn();

    expect(() => runtime.initializeMainProcessIpcOnce(failingInitializer)).toThrow(
      'registration failed',
    );
    expect(runtime.initializeMainProcessIpcOnce(successfulInitializer)).toBe(true);
    expect(runtime.initializeMainProcessIpcOnce(successfulInitializer)).toBe(false);
    expect(failingInitializer).toHaveBeenCalledTimes(1);
    expect(successfulInitializer).toHaveBeenCalledTimes(1);
  });

  test('owns VM worker runtime lifecycle', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const vmWorkerRuntime = { stop: jest.fn() };

    runtime.setVmWorkerRuntime(vmWorkerRuntime);

    expect(runtime.stopVmWorker()).toBe(true);
    expect(vmWorkerRuntime.stop).toHaveBeenCalledTimes(1);
    expect(runtime.stopVmWorker()).toBe(false);
  });

  test('persists user intent when the chat pill is hidden by the user', () => {
    const persistChatPillUserHidden = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      persistChatPillUserHidden,
    });
    const chatWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);

    expect(runtime.hideChatWindow({ reason: 'user' })).toEqual({ success: true });

    expect(persistChatPillUserHidden).toHaveBeenCalledWith(true);
    expect(runtime.getState().chatPillUserHidden).toBe(true);
    expect(chatWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('suppresses generic startup restore when the user hid the chat pill', () => {
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      initialChatPillUserHidden: true,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    const result = runtime.showChatWindow({ focus: true, reason: 'startup' });

    expect(result).toEqual({
      success: true,
      suppressed: true,
      reason: 'chat-pill-user-hidden',
    });
    expect(chatWindow.show).not.toHaveBeenCalled();
    expect(runtime.getState().chatPillUserHidden).toBe(true);
  });

  test('wakeword clears user-hidden intent and reopens the chat pill', () => {
    const persistChatPillUserHidden = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      initialChatPillUserHidden: true,
      persistChatPillUserHidden,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    const result = runtime.showChatWindow({ focus: true, reason: 'wakeword' });

    expect(result).toEqual({ success: true });
    expect(persistChatPillUserHidden).toHaveBeenCalledWith(false);
    expect(chatWindow.show).toHaveBeenCalledTimes(1);
    expect(chatWindow.focus).toHaveBeenCalledTimes(1);
    expect(runtime.getState().chatPillUserHidden).toBe(false);
  });

  test('runtime capture hides do not mark the chat pill as user-hidden', () => {
    const persistChatPillUserHidden = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      persistChatPillUserHidden,
    });
    const chatWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);

    expect(runtime.hideChatWindow({ reason: 'capture' })).toEqual({ success: true });

    expect(persistChatPillUserHidden).not.toHaveBeenCalled();
    expect(runtime.getState().chatPillUserHidden).toBe(false);
  });

  test('logs chat pill show decisions with reasons', () => {
    const log = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      log,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    runtime.showChatWindow({ focus: true, reason: 'wakeword' });

    expect(log).toHaveBeenCalledWith('[ChatPillVisibility][main]', expect.objectContaining({
      action: 'show-applied',
      reason: 'wakeword',
      user_hidden: false,
      focus: true,
      chat_window_visible: false,
    }));
  });

  test('logs suppressed chat pill show decisions with reasons', () => {
    const log = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      initialChatPillUserHidden: true,
      log,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    runtime.showChatWindow({ focus: true, reason: 'startup' });

    expect(log).toHaveBeenCalledWith('[ChatPillVisibility][main]', expect.objectContaining({
      action: 'show-suppressed',
      reason: 'startup',
      user_hidden: true,
      focus: true,
      result_reason: 'chat-pill-user-hidden',
    }));
  });

  test('suppresses repeated startup chat pill shows after startup handoff already ran', () => {
    const log = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      log,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    expect(runtime.showChatWindow({ focus: true, reason: 'startup' })).toEqual({ success: true });
    const secondResult = runtime.showChatWindow({ focus: true, reason: 'startup' });

    expect(secondResult).toEqual({
      success: true,
      suppressed: true,
      reason: 'startup-surface-already-applied',
    });
    expect(log).toHaveBeenCalledWith('[ChatPillVisibility][main]', expect.objectContaining({
      action: 'show-suppressed',
      reason: 'startup',
      result_reason: 'startup-surface-already-applied',
    }));
  });
});
