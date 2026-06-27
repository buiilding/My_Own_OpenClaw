/** @jest-environment node */

const {
  handleHideChatbox,
  handleHandoffSurfaceForComputerUse,
  handlePrepareSurfaceForScreenshot,
  handleRestoreSurfaceAfterScreenshot,
  handleShowChatbox,
  handleShowMainWindow,
} = require('../../src/main/surfaces/overlay_visibility_handler.cjs');

describe('overlay_visibility_handler', () => {
  test('show-main-window uses focus true by default and returns result', () => {
    const showMainWindow = jest.fn().mockReturnValue({ success: true });
    const resolveTargetDisplayAffinity = jest.fn().mockReturnValue(null);

    const result = handleShowMainWindow(undefined, {
      showMainWindow,
      resolveTargetDisplayAffinity,
    });

    expect(result).toEqual({ success: true });
    expect(showMainWindow.mock.calls[0][0]).toEqual({
      focus: true,
      maximize: false,
      open: '',
      reason: 'renderer:show-main-window',
      targetDisplayAffinity: null,
    });
  });

  test('show-main-window passes maximize true when requested', () => {
    const showMainWindow = jest.fn().mockReturnValue({ success: true });
    const resolveTargetDisplayAffinity = jest.fn().mockReturnValue({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });

    const result = handleShowMainWindow({ maximize: true }, {
      showMainWindow,
      resolveTargetDisplayAffinity,
    });

    expect(result).toEqual({ success: true });
    expect(showMainWindow.mock.calls[0][0]).toEqual({
      focus: true,
      maximize: true,
      open: '',
      reason: 'renderer:show-main-window',
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      },
    });
  });

  test('show-main-window returns formatted error result on exception', () => {
    const showMainWindow = jest.fn(() => {
      throw new Error('explode');
    });

    const result = handleShowMainWindow(undefined, { showMainWindow });

    expect(result).toEqual({
      success: false,
      reason: 'Failed to show main window: explode',
    });
  });

  test('show-chatbox defaults focus to true', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true, visible: true });
    const resolveTargetDisplayAffinity = jest.fn().mockReturnValue(null);

    const result = handleShowChatbox(undefined, { showChatWindow, resolveTargetDisplayAffinity });

    expect(result).toEqual({ success: true, visible: true });
    expect(showChatWindow).toHaveBeenCalledWith({
      focus: true,
      restoreResponseOverlay: false,
      targetDisplayAffinity: null,
    });
  });

  test('show-chatbox passes explicit focus false', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true, visible: true });
    const resolveTargetDisplayAffinity = jest.fn().mockReturnValue({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    });

    const result = handleShowChatbox({ focus: false }, { showChatWindow, resolveTargetDisplayAffinity });

    expect(result).toEqual({ success: true, visible: true });
    expect(showChatWindow).toHaveBeenCalledWith({
      focus: false,
      restoreResponseOverlay: false,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      },
    });
  });

  test('hide-chatbox delegates return value', () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: true, hidden: true });

    const result = handleHideChatbox({ reason: 'user' }, { hideChatWindow });

    expect(result).toEqual({ success: true, hidden: true });
    expect(hideChatWindow).toHaveBeenCalledWith({ reason: 'user' });
  });

  test('handoff-surface-for-computer-use switches visible dashboard to chat pill', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true });
    const result = handleHandoffSurfaceForComputerUse({}, {
      getWindows: () => ({
        mainWindow: {
          isDestroyed: () => false,
          isVisible: () => true,
        },
      }),
      showChatWindow,
    });

    expect(result).toEqual({ success: true, handedOff: true, surface: 'chatbox' });
    expect(showChatWindow).toHaveBeenCalledWith({
      focus: false,
      restoreResponseOverlay: true,
      targetDisplayAffinity: null,
    });
  });

  test('handoff-surface-for-computer-use no-ops when dashboard is not visible', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true });
    const result = handleHandoffSurfaceForComputerUse({}, {
      getWindows: () => ({
        mainWindow: {
          isDestroyed: () => false,
          isVisible: () => false,
        },
      }),
      showChatWindow,
    });

    expect(result).toEqual({ success: true, handedOff: false, surface: 'none' });
    expect(showChatWindow).not.toHaveBeenCalled();
  });

  test('restore-surface-after-screenshot restores chatbox with response overlay support', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true });

    const result = handleRestoreSurfaceAfterScreenshot(
      { hiddenSurface: 'chatbox-response' },
      { showChatWindow },
    );

    expect(result).toEqual({ success: true });
    expect(showChatWindow).toHaveBeenCalledWith({
      focus: false,
      restoreResponseOverlay: true,
      targetDisplayAffinity: null,
    });
  });

  test('restore-surface-after-screenshot restores chatbox without response overlay when only the pill was hidden', () => {
    const showChatWindow = jest.fn().mockReturnValue({ success: true });

    const result = handleRestoreSurfaceAfterScreenshot(
      { hiddenSurface: 'chatbox' },
      { showChatWindow },
    );

    expect(result).toEqual({ success: true });
    expect(showChatWindow).toHaveBeenCalledWith({
      focus: false,
      restoreResponseOverlay: false,
      targetDisplayAffinity: null,
    });
  });

  test('restore-surface-after-screenshot restores response overlay only when it was the only hidden surface', () => {
    const showResponseWindowInactive = jest.fn();
    const ensureResponseOverlayFallbackBounds = jest.fn();
    const setResponseOverlayVisibilityState = jest.fn();

    const result = handleRestoreSurfaceAfterScreenshot(
      { hiddenSurface: 'response' },
      {
        responseWindow: {
          isDestroyed: () => false,
        },
        showResponseWindowInactive,
        ensureResponseOverlayFallbackBounds,
        setResponseOverlayVisibilityState,
      },
    );

    expect(result).toEqual({ success: true, restored: true });
    expect(setResponseOverlayVisibilityState).toHaveBeenCalledWith(true);
    expect(ensureResponseOverlayFallbackBounds).toHaveBeenCalledTimes(1);
    expect(showResponseWindowInactive).toHaveBeenCalledTimes(1);
  });

  test('restore-surface-after-screenshot suppresses response-only restore when floating surface is not owner', () => {
    const showResponseWindowInactive = jest.fn();
    const ensureResponseOverlayFallbackBounds = jest.fn();
    const setResponseOverlayVisibilityState = jest.fn();
    const responseWindow = {
      isDestroyed: () => false,
      isVisible: jest.fn(() => true),
      hide: jest.fn(),
    };

    const result = handleRestoreSurfaceAfterScreenshot(
      { hiddenSurface: 'response' },
      {
        responseWindow,
        showResponseWindowInactive,
        ensureResponseOverlayFallbackBounds,
        setResponseOverlayVisibilityState,
        canShowFloatingResponseOverlay: jest.fn(() => false),
      },
    );

    expect(result).toEqual({
      success: true,
      restored: false,
      ignored: true,
      reason: 'surface-not-owner',
    });
    expect(setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(ensureResponseOverlayFallbackBounds).not.toHaveBeenCalled();
    expect(showResponseWindowInactive).not.toHaveBeenCalled();
  });

  test('restore-surface-after-screenshot restores dashboard when needed', () => {
    const showMainWindow = jest.fn().mockReturnValue({ success: true });

    const result = handleRestoreSurfaceAfterScreenshot(
      { hiddenSurface: 'main-window' },
      { showMainWindow },
    );

    expect(result).toEqual({ success: true });
    expect(showMainWindow.mock.calls[0][0]).toEqual({
      focus: false,
      maximize: false,
      open: '',
      targetDisplayAffinity: null,
    });
  });

  test('prepare-surface-for-screenshot hides then waits in main process', async () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: true, hidden: true });
    const hideMainWindow = jest.fn().mockReturnValue({ success: true, hidden: true });
    const waitInMain = jest.fn().mockResolvedValue(undefined);
    const event = {
      sender: { id: 'chat-webcontents' },
    };
    const getWindows = () => ({
      chatWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
        webContents: event.sender,
      },
      mainWindow: {
        isDestroyed: () => false,
        isVisible: () => false,
        webContents: { id: 'main-webcontents' },
      },
    });

    const result = await handlePrepareSurfaceForScreenshot(
      event,
      { waitMs: 2000, settleMs: 120 },
      { getWindows, hideChatWindow, hideMainWindow, waitInMain },
    );

    expect(result).toEqual({
      success: true,
      hidden: true,
      hideSurface: true,
      hiddenSurface: 'chatbox',
      waitMs: 2000,
      settleMs: 120,
      waitTime: expect.any(Number),
      hideInvokeTime: expect.any(Number),
      settleTime: expect.any(Number),
    });
    expect(hideChatWindow).toHaveBeenCalledTimes(1);
    expect(hideMainWindow).not.toHaveBeenCalled();
    expect(waitInMain).toHaveBeenNthCalledWith(1, 2000);
    expect(waitInMain).toHaveBeenNthCalledWith(2, 120);
  });

  test('prepare-surface-for-screenshot preserves chatbox-plus-response visibility shape', async () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: true, hidden: true });
    const hideMainWindow = jest.fn().mockResolvedValue({ success: true, hidden: true });
    const waitInMain = jest.fn().mockResolvedValue(undefined);
    const event = {
      sender: { id: 'chat-webcontents' },
    };
    const getWindows = () => ({
      chatWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
        webContents: event.sender,
      },
      responseWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
        webContents: { id: 'response-webcontents' },
      },
      mainWindow: {
        isDestroyed: () => false,
        isVisible: () => false,
        webContents: { id: 'main-webcontents' },
      },
    });

    const result = await handlePrepareSurfaceForScreenshot(
      event,
      { waitMs: 0, settleMs: 120 },
      { getWindows, hideChatWindow, hideMainWindow, waitInMain },
    );

    expect(result.hiddenSurface).toBe('chatbox-response');
    expect(hideChatWindow).toHaveBeenCalledTimes(1);
    expect(hideMainWindow).not.toHaveBeenCalled();
  });

  test('prepare-surface-for-screenshot can hide response overlay without chatbox visibility', async () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: true, hidden: true });
    const hideMainWindow = jest.fn().mockResolvedValue({ success: true, hidden: true });
    const waitInMain = jest.fn().mockResolvedValue(undefined);
    const responseWindow = {
      isDestroyed: () => false,
      isVisible: () => true,
      hide: jest.fn(),
      webContents: { id: 'response-webcontents' },
    };
    const broadcastResponseOverlayVisibility = jest.fn();

    const result = await handlePrepareSurfaceForScreenshot(
      { sender: responseWindow.webContents },
      { waitMs: 0, settleMs: 120 },
      {
        getWindows: () => ({
          chatWindow: {
            isDestroyed: () => false,
            isVisible: () => false,
            webContents: { id: 'chat-webcontents' },
          },
          responseWindow,
          mainWindow: {
            isDestroyed: () => false,
            isVisible: () => false,
            webContents: { id: 'main-webcontents' },
          },
        }),
        hideChatWindow,
        hideMainWindow,
        waitInMain,
        responseWindow,
        broadcastResponseOverlayVisibility,
      },
    );

    expect(result.hiddenSurface).toBe('response');
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(broadcastResponseOverlayVisibility).toHaveBeenCalledWith(false);
    expect(hideChatWindow).not.toHaveBeenCalled();
    expect(hideMainWindow).not.toHaveBeenCalled();
  });

  test('prepare-surface-for-screenshot hides the dashboard surface when sender is main window', async () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: true, hidden: true });
    const hideMainWindow = jest.fn().mockResolvedValue({
      success: true,
      suppressedForScreenshot: true,
      minimized: true,
    });
    const waitInMain = jest.fn().mockResolvedValue(undefined);
    const event = {
      sender: { id: 'main-webcontents' },
    };
    const getWindows = () => ({
      chatWindow: {
        isDestroyed: () => false,
        isVisible: () => false,
        webContents: { id: 'chat-webcontents' },
      },
      mainWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
        webContents: event.sender,
      },
    });

    const result = await handlePrepareSurfaceForScreenshot(
      event,
      { waitMs: 2000, settleMs: 120 },
      { getWindows, hideChatWindow, hideMainWindow, waitInMain },
    );

    expect(result).toEqual({
      success: true,
      suppressedForScreenshot: true,
      minimized: true,
      hideSurface: true,
      hiddenSurface: 'main-window',
      waitMs: 2000,
      settleMs: 120,
      waitTime: expect.any(Number),
      hideInvokeTime: expect.any(Number),
      settleTime: expect.any(Number),
    });
    expect(hideMainWindow).toHaveBeenCalledTimes(1);
    expect(hideMainWindow).toHaveBeenCalledWith({ suppressForScreenshot: true });
    expect(hideChatWindow).not.toHaveBeenCalled();
  });

  test('prepare-surface-for-screenshot returns hide failure without waiting', async () => {
    const hideChatWindow = jest.fn().mockReturnValue({ success: false, reason: 'Chat window not available' });
    const hideMainWindow = jest.fn().mockReturnValue({ success: true, hidden: true });
    const waitInMain = jest.fn().mockResolvedValue(undefined);
    const event = {
      sender: { id: 'chat-webcontents' },
    };
    const getWindows = () => ({
      chatWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
        webContents: event.sender,
      },
      mainWindow: {
        isDestroyed: () => false,
        isVisible: () => false,
        webContents: { id: 'main-webcontents' },
      },
    });

    const result = await handlePrepareSurfaceForScreenshot(
      event,
      { waitMs: 2000, settleMs: 120 },
      { getWindows, hideChatWindow, hideMainWindow, waitInMain },
    );

    expect(result).toEqual({ success: false, reason: 'Chat window not available' });
    expect(hideMainWindow).not.toHaveBeenCalled();
    expect(waitInMain).toHaveBeenCalledTimes(1);
    expect(waitInMain).toHaveBeenCalledWith(2000);
  });

  test('prepare-surface-for-screenshot resolves hidden surface preference as main, then chat, then none', async () => {
    const waitInMain = jest.fn().mockResolvedValue(undefined);
    const hideChatWindow = jest.fn(() => ({ success: true, hidden: true }));
    const hideMainWindow = jest.fn(async () => ({ success: true, hidden: true }));
    const sender = { id: 'other-webcontents' };

    const mainPreferred = await handlePrepareSurfaceForScreenshot(
      { sender },
      { waitMs: 0, settleMs: 0 },
      {
        waitInMain,
        hideChatWindow,
        hideMainWindow,
        getWindows: () => ({
          mainWindow: {
            isDestroyed: () => false,
            isVisible: () => true,
            webContents: { id: 'main-webcontents' },
          },
          chatWindow: {
            isDestroyed: () => false,
            isVisible: () => true,
            webContents: { id: 'chat-webcontents' },
          },
        }),
      },
    );
    expect(mainPreferred.hiddenSurface).toBe('main-window');

    const chatPreferred = await handlePrepareSurfaceForScreenshot(
      { sender },
      { waitMs: 0, settleMs: 0 },
      {
        waitInMain,
        hideChatWindow,
        hideMainWindow,
        getWindows: () => ({
          mainWindow: {
            isDestroyed: () => false,
            isVisible: () => false,
            webContents: { id: 'main-webcontents' },
          },
          chatWindow: {
            isDestroyed: () => false,
            isVisible: () => true,
            webContents: { id: 'chat-webcontents' },
          },
        }),
      },
    );
    expect(chatPreferred.hiddenSurface).toBe('chatbox');

    const nonePreferred = await handlePrepareSurfaceForScreenshot(
      { sender },
      { waitMs: 0, settleMs: 0 },
      {
        waitInMain,
        hideChatWindow,
        hideMainWindow,
        getWindows: () => ({
          mainWindow: {
            isDestroyed: () => false,
            isVisible: () => false,
            webContents: { id: 'main-webcontents' },
          },
          chatWindow: {
            isDestroyed: () => false,
            isVisible: () => false,
            webContents: { id: 'chat-webcontents' },
          },
        }),
      },
    );
    expect(nonePreferred.hiddenSurface).toBe('none');
  });
});
