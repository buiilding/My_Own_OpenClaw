/** @jest-environment node */

const {
  initializeOverlayPhaseHandlersRuntime,
} = require('../../frontend/src/main/overlay_phase_ipc_runtime.cjs');

describe('overlay_phase_ipc_runtime', () => {
  function createRuntime(overrides = {}) {
    const invokeHandlers = {};
    const eventHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
      on: jest.fn((channel, handler) => {
        eventHandlers[channel] = handler;
      }),
    };

    initializeOverlayPhaseHandlersRuntime({
      ipcMain,
      BrowserWindow: {
        fromWebContents: jest.fn(() => null),
      },
      screen: {},
      getWindows: () => ({}),
      positionResponseWindow: jest.fn(),
      positionContextLabelWindow: jest.fn(),
      syncContextLabelWindowVisibility: jest.fn(),
      getResponseWindowBounds: jest.fn(),
      setResponseOverlayVisibilityState: jest.fn(),
      showResponseWindowWhenChatVisible: jest.fn(),
      showChatWindow: jest.fn(),
      showMainWindow: jest.fn(),
      hideChatWindow: jest.fn(),
      warn: jest.fn(),
      ...overrides,
    });

    return {
      invokeHandlers,
      eventHandlers,
    };
  }

  test('does not register deprecated overlay interactivity/focus-prep invoke channels', () => {
    const { invokeHandlers } = createRuntime();

    expect(invokeHandlers['set-overlay-ignore-mouse']).toBeUndefined();
    expect(invokeHandlers['set-overlay-focusable']).toBeUndefined();
    expect(invokeHandlers['prepare-overlay-tool-focus']).toBeUndefined();
  });

  test('registers only phase-owned overlay surface channels', () => {
    const { invokeHandlers, eventHandlers } = createRuntime();

    expect(invokeHandlers['set-chatbox-size']).toBeUndefined();
    expect(typeof invokeHandlers['set-responsebox-size']).toBe('function');
    expect(typeof invokeHandlers['set-chatbox-visual-anchor-height']).toBe('function');
    expect(typeof invokeHandlers['show-chatbox']).toBe('function');
    expect(typeof invokeHandlers['hide-chatbox']).toBe('function');
    expect(typeof invokeHandlers['handoff-surface-for-computer-use']).toBe('function');
    expect(typeof invokeHandlers['demote-overlay-topmost-for-window-switch']).toBe('function');
    expect(typeof invokeHandlers['restore-overlay-topmost-after-window-switch']).toBe('function');
    expect(typeof invokeHandlers['prepare-surface-for-screenshot']).toBe('function');
    expect(typeof invokeHandlers['restore-surface-after-screenshot']).toBe('function');
    expect(typeof eventHandlers['move-chatbox-to']).toBe('function');
    expect(invokeHandlers['show-main-window']).toBeUndefined();
    expect(invokeHandlers['list-permissions']).toBeUndefined();
  });

  test('handoff-surface-for-computer-use routes to chatbox restore contract', async () => {
    const showChatWindow = jest.fn(() => ({ success: true }));
    const { invokeHandlers } = createRuntime({
      getWindows: () => ({
        mainWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
        },
      }),
      showChatWindow,
    });

    const result = await invokeHandlers['handoff-surface-for-computer-use']({}, {});

    expect(result).toEqual({ success: true, handedOff: true, surface: 'chatbox' });
    expect(showChatWindow).toHaveBeenCalledWith({
      focus: false,
      restoreResponseOverlay: true,
      targetDisplayAffinity: null,
    });
  });

  test('demote-overlay-topmost-for-window-switch demotes visible overlays and restores external focus best-effort', async () => {
    const setAlwaysOnTop = jest.fn();
    const blur = jest.fn();
    const restorePreviousExternalFocusedWindow = jest.fn(() => true);
    const { invokeHandlers } = createRuntime({
      getWindows: () => ({
        chatWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
          setAlwaysOnTop,
          blur,
        },
      }),
      externalFocusTracker: {
        canTrackExternalFocus: jest.fn(() => true),
        restorePreviousExternalFocusedWindow,
      },
    });

    const result = await invokeHandlers['demote-overlay-topmost-for-window-switch']({}, {});

    expect(result).toEqual({
      success: true,
      demoted: true,
      restoredExternalFocus: true,
    });
    expect(setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(blur).toHaveBeenCalledTimes(1);
    expect(restorePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
  });

  test('restore-overlay-topmost-after-window-switch re-promotes visible overlays', async () => {
    const setAlwaysOnTop = jest.fn();
    const moveTop = jest.fn();
    const { invokeHandlers } = createRuntime({
      platform: 'darwin',
      getWindows: () => ({
        chatWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
          setAlwaysOnTop,
          moveTop,
        },
      }),
    });

    const result = await invokeHandlers['restore-overlay-topmost-after-window-switch']({}, {});

    expect(result).toEqual({
      success: true,
      restored: true,
    });
    expect(setAlwaysOnTop).toHaveBeenCalled();
    expect(moveTop).toHaveBeenCalledTimes(1);
  });

  test('routes chatbox visual anchor updates to positioning runtime', async () => {
    const positionResponseWindow = jest.fn();
    const positionContextLabelWindow = jest.fn();
    const syncContextLabelWindowVisibility = jest.fn();
    const setChatVisualAnchorHeight = jest.fn(() => true);
    const { invokeHandlers } = createRuntime({
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      setChatVisualAnchorHeight,
    });

    const result = await invokeHandlers['set-chatbox-visual-anchor-height'](null, { height: 116 });

    expect(result).toEqual({
      success: true,
      height: 116,
      changed: true,
    });
    expect(setChatVisualAnchorHeight).toHaveBeenCalledWith(116);
    expect(positionResponseWindow).toHaveBeenCalledTimes(1);
    expect(positionContextLabelWindow).toHaveBeenCalledTimes(1);
    expect(syncContextLabelWindowVisibility).toHaveBeenCalledTimes(1);
  });

  test('show-chatbox resolves target display affinity from the active surface contract', async () => {
    const showChatWindow = jest.fn(() => ({ success: true }));
    const screen = {
      getAllDisplays: jest.fn(() => ([
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        },
        {
          id: 2,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      ])),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
      getDisplayMatching: jest.fn((bounds) => {
        if (bounds && bounds.x >= 1920) {
          return {
            id: 2,
            bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
            workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
          };
        }
        return {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        };
      }),
    };
    const BrowserWindow = {
      fromWebContents: jest.fn(() => ({
        isDestroyed: jest.fn(() => false),
        isVisible: jest.fn(() => false),
        getBounds: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 200 })),
      })),
    };
    const { invokeHandlers } = createRuntime({
      BrowserWindow,
      screen,
      getWindows: () => ({
        mainWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => false),
          getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1000, height: 700 })),
        },
        chatWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
          getBounds: jest.fn(() => ({ x: 2200, y: 80, width: 520, height: 116 })),
        },
      }),
      showChatWindow,
      getActiveDisplayAffinity: jest.fn(() => null),
    });

    const result = await invokeHandlers['show-chatbox']({ sender: {} }, { focus: true });

    expect(result).toEqual({ success: true });
    expect(showChatWindow).toHaveBeenCalledWith({
      focus: true,
      restoreResponseOverlay: false,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
      },
    });
  });
});
