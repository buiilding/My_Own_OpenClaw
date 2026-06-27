/** @jest-environment node */

const { createSurfaceRuntime } = require('../../src/main/surfaces/surface_runtime.cjs');

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
    setContentProtection: jest.fn(),
    setBounds: jest.fn(),
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

  test('pointer-control lease makes overlay surfaces click-through and restores pill hit-test policy', async () => {
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      toolSurfaceSettleMs: 0,
    });
    const chatWindow = createWindow({ visible: true });
    const responseWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);
    runtime.setResponseWindow(responseWindow);
    runtime.setChatboxHitTestActive(true);
    runtime.setResponseboxHitTestActive(true);

    const release = await runtime.beginPointerControlLease({ toolName: 'mouse_control' });

    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(chatWindow.setFocusable).toHaveBeenCalledWith(false);
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });

    await release();

    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(chatWindow.setFocusable).toHaveBeenLastCalledWith(true);
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(responseWindow.setFocusable).toHaveBeenLastCalledWith(true);
  });

  test('pointer-control lease keeps hover sync from restoring focusability before release', async () => {
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      toolSurfaceSettleMs: 0,
    });
    const chatWindow = createWindow({ visible: true });
    const responseWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);
    runtime.setResponseWindow(responseWindow);

    const release = await runtime.beginPointerControlLease({ toolName: 'mouse_control' });

    runtime.setChatboxHitTestActive(true);
    runtime.setResponseboxHitTestActive(true);
    runtime.syncChatboxHitTestState();
    runtime.syncResponseboxHitTestState();

    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    expect(chatWindow.setFocusable).toHaveBeenLastCalledWith(false);
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    expect(responseWindow.setFocusable).toHaveBeenLastCalledWith(false);

    await release();

    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(chatWindow.setFocusable).toHaveBeenLastCalledWith(true);
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(responseWindow.setFocusable).toHaveBeenLastCalledWith(true);
  });

  test('activates chatbox text entry through the focused chat window path', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const chatWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);

    const result = runtime.activateChatboxTextEntry();

    expect(result).toEqual({ success: true });
    expect(chatWindow.focus).toHaveBeenCalledTimes(1);
    expect(chatWindow.webContents.send).toHaveBeenCalledWith('chatbox-focus');
    expect(runtime.getPrimarySurface()).toBe('chat');
  });

  test('refuses chatbox text entry activation during pointer-control leases', async () => {
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      toolSurfaceSettleMs: 0,
    });
    const chatWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);

    const release = await runtime.beginPointerControlLease({ toolName: 'mouse_control' });
    const result = runtime.activateChatboxTextEntry();

    expect(result).toEqual({
      success: false,
      reason: 'pointer-control-lease-active',
    });
    expect(chatWindow.focus).not.toHaveBeenCalled();
    expect(chatWindow.webContents.send).not.toHaveBeenCalledWith('chatbox-focus');

    await release();
  });

  test('response overlay hit-test is active only while renderer reports pointer inside response shell', () => {
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
    });
    const responseWindow = createWindow({ visible: true });
    runtime.setResponseWindow(responseWindow);

    runtime.setResponseboxHitTestActive(false);
    runtime.syncResponseboxHitTestState();
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });

    runtime.setResponseboxHitTestActive(true);
    runtime.syncResponseboxHitTestState();
    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  test('streaming phase does not make active pill hit-test click-through', () => {
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
    });
    const chatWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);
    runtime.setChatboxHitTestActive(true);

    runtime.applyResponseOverlayPhase({ phase: 'streaming' });
    runtime.syncChatboxHitTestState();

    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  test('linux screenshot lease hides visible overlays and restores them inactive', async () => {
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      platform: 'linux',
      toolSurfaceSettleMs: 0,
    });
    const chatWindow = createWindow({ visible: true });
    const responseWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);
    runtime.setResponseWindow(responseWindow);

    const release = await runtime.beginScreenshotCaptureLease({ toolName: 'screenshot' });

    expect(chatWindow.hide).toHaveBeenCalledTimes(1);
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(release.trace).toEqual(expect.objectContaining({
      platform: 'linux',
      leaseMode: 'hide_restore',
      visibleCaptureWindowCount: 2,
    }));

    await release();

    expect(chatWindow.showInactive).toHaveBeenCalledTimes(1);
    expect(responseWindow.showInactive).toHaveBeenCalledTimes(1);
  });

  test('linux screenshot lease falls back to default settle delay for invalid overrides', async () => {
    jest.useFakeTimers();
    try {
      const runtime = createSurfaceRuntime({
        ...createSurfaceDeps(),
        platform: 'linux',
        toolSurfaceSettleMs: '80ms',
      });
      const chatWindow = createWindow({ visible: true });
      runtime.setChatWindow(chatWindow);

      let settled = false;
      const leasePromise = runtime.beginScreenshotCaptureLease({ toolName: 'screenshot' })
        .then((release) => {
          settled = true;
          return release;
        });
      await Promise.resolve();

      expect(chatWindow.hide).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      jest.advanceTimersByTime(79);
      await Promise.resolve();
      expect(settled).toBe(false);

      jest.advanceTimersByTime(1);
      const release = await leasePromise;

      expect(settled).toBe(true);
      await release();
      expect(chatWindow.showInactive).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('macos and windows screenshot lease use content protection instead of hide-show', async () => {
    const deps = createSurfaceDeps();
    const runtime = createSurfaceRuntime({
      ...deps,
      platform: 'darwin',
      toolSurfaceSettleMs: 0,
    });
    const chatWindow = createWindow({ visible: true });
    const responseWindow = createWindow({ visible: true });
    runtime.setChatWindow(chatWindow);
    runtime.setResponseWindow(responseWindow);

    const release = await runtime.beginScreenshotCaptureLease({ toolName: 'screenshot' });

    expect(chatWindow.hide).not.toHaveBeenCalled();
    expect(release.trace).toEqual(expect.objectContaining({
      platform: 'darwin',
      leaseMode: 'content_protection',
      visibleCaptureWindowCount: 2,
    }));
    expect(deps.windowPlatformPolicy.applyContentProtection).toHaveBeenNthCalledWith(1, {
      targetWindow: chatWindow,
      windowLabel: 'chat box',
      enabled: true,
    });
    expect(deps.windowPlatformPolicy.applyContentProtection).toHaveBeenNthCalledWith(2, {
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
      enabled: true,
    });

    await release();

    expect(deps.windowPlatformPolicy.applyContentProtection).toHaveBeenNthCalledWith(3, {
      targetWindow: chatWindow,
      windowLabel: 'chat box',
      enabled: false,
    });
    expect(deps.windowPlatformPolicy.applyContentProtection).toHaveBeenNthCalledWith(4, {
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
      enabled: false,
    });
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
    const appendSurfaceVisibilityDiagnostic = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      log,
      appendSurfaceVisibilityDiagnostic,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    runtime.showChatWindow({ focus: true, reason: 'wakeword' });

    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('[ChatPillVisibility][main]'));
    expect(appendSurfaceVisibilityDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'show-applied',
      reason: 'wakeword',
      userHidden: false,
      focus: true,
      chatWindowVisible: false,
    }));
  });

  test('logs suppressed chat pill show decisions with reasons', () => {
    const log = jest.fn();
    const appendSurfaceVisibilityDiagnostic = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      initialChatPillUserHidden: true,
      log,
      appendSurfaceVisibilityDiagnostic,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    runtime.showChatWindow({ focus: true, reason: 'startup' });

    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('[ChatPillVisibility][main]'));
    expect(appendSurfaceVisibilityDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'show-suppressed',
      reason: 'startup',
      userHidden: true,
      focus: true,
      resultReason: 'chat-pill-user-hidden',
    }));
  });

  test('suppresses repeated startup chat pill shows after startup handoff already ran', () => {
    const log = jest.fn();
    const appendSurfaceVisibilityDiagnostic = jest.fn();
    const runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      log,
      appendSurfaceVisibilityDiagnostic,
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
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('[ChatPillVisibility][main]'));
    expect(appendSurfaceVisibilityDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'show-suppressed',
      reason: 'startup',
      resultReason: 'startup-surface-already-applied',
    }));
  });

  test('does not advance chat surface state when chat show fails', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const missingChatResult = runtime.showChatWindow({ focus: true, reason: 'startup' });

    expect(missingChatResult).toEqual({
      success: false,
      reason: 'Chat window not available',
    });
    expect(runtime.getPrimarySurface()).toBe('dashboard');

    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    expect(runtime.showChatWindow({ focus: true, reason: 'startup' })).toEqual({ success: true });
    expect(runtime.getPrimarySurface()).toBe('chat');
    expect(chatWindow.show).toHaveBeenCalledTimes(1);
  });

  test('allows floating response overlay only while chat is the visible primary surface', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const mainWindow = createWindow({ visible: false });
    const chatWindow = createWindow({ visible: true });
    runtime.setMainWindow(mainWindow);
    runtime.setChatWindow(chatWindow);

    expect(runtime.canShowFloatingResponseOverlay()).toBe(false);

    expect(runtime.showChatWindow({ focus: false, reason: 'wakeword' })).toEqual({ success: true });
    expect(runtime.getPrimarySurface()).toBe('chat');
    expect(runtime.canShowFloatingResponseOverlay()).toBe(true);

    const visibleMainWindow = createWindow({ visible: true });
    runtime.setMainWindow(visibleMainWindow);
    expect(runtime.showMainWindow({ open: 'chat', reason: 'renderer' })).toEqual({ success: true });
    expect(runtime.getPrimarySurface()).toBe('dashboard');
    expect(runtime.canShowFloatingResponseOverlay()).toBe(false);
  });

  test('reapplies latest SDK live-turn surface intent after chat becomes primary surface', () => {
    const observedPrimarySurfaces = [];
    let runtime = null;
    const reapplyLatestSdkLiveTurnSurfaceIntent = jest.fn(() => {
      observedPrimarySurfaces.push(runtime.getPrimarySurface());
      return { success: true };
    });
    runtime = createSurfaceRuntime({
      ...createSurfaceDeps(),
      reapplyLatestSdkLiveTurnSurfaceIntent,
    });
    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);

    expect(runtime.showChatWindow({ focus: false, reason: 'wakeword' })).toEqual({ success: true });

    expect(reapplyLatestSdkLiveTurnSurfaceIntent).toHaveBeenCalledWith({
      reason: 'wakeword',
      primarySurface: 'chat',
    });
    expect(observedPrimarySurfaces).toEqual(['chat']);
  });

  test('records dismissed response overlay guards', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());

    expect(runtime.isResponseOverlayGuardDismissed(' turn-a ')).toBe(false);
    expect(runtime.dismissResponseOverlayGuardRef(' turn-a ')).toBe(true);
    expect(runtime.dismissResponseOverlayGuardRef('turn-a')).toBe(false);
    expect(runtime.isResponseOverlayGuardDismissed('turn-a')).toBe(true);
    expect(runtime.isResponseOverlayGuardDismissed('turn-b')).toBe(false);
  });

  test('does not advance main surface state when main-window show fails', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());

    expect(runtime.showChatWindow({ focus: true, reason: 'startup' })).toEqual({
      success: false,
      reason: 'Chat window not available',
    });
    expect(runtime.showMainWindow({ open: 'onboarding', reason: 'startup' })).toEqual({
      success: false,
      reason: 'Main window not available',
    });

    expect(runtime.getPrimarySurface()).toBe('dashboard');
    expect(runtime.getMainWindowMode()).toBe('dashboard');

    const chatWindow = createWindow({ visible: false });
    runtime.setChatWindow(chatWindow);
    expect(runtime.showChatWindow({ focus: true, reason: 'startup' })).toEqual({ success: true });
  });
});
