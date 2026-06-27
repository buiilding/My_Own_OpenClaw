/** @jest-environment node */

const {
  handleSetResponseboxSize,
} = require('../../src/main/surfaces/overlay_responsebox_handler.cjs');
const {
  configureDebugEnvRuntime,
} = require('../../src/main/app/debug_env.cjs');

const sampleDebugConfig = Object.freeze({
  env: Object.freeze({
    liveSurface: 'SAMPLE_DEBUG_LIVE_SURFACE',
  }),
});

describe('overlay_responsebox_handler', () => {
  function createDeps(overrides = {}) {
    return {
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        hide: jest.fn(),
        setBounds: jest.fn(),
        getBounds: jest.fn().mockReturnValue({ x: 10, y: 20, width: 520, height: 236 }),
        isFocusable: jest.fn().mockReturnValue(false),
      },
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        getBounds: jest.fn().mockReturnValue({ x: 100, y: 200, width: 300, height: 400 }),
        isFocusable: jest.fn().mockReturnValue(true),
      },
      mainWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn().mockReturnValue({ x: 0, y: 0, width: 1000, height: 700 }),
      },
      BrowserWindow: {
        fromWebContents: jest.fn(() => ({
          isDestroyed: jest.fn().mockReturnValue(false),
          isVisible: jest.fn().mockReturnValue(false),
          getBounds: jest.fn().mockReturnValue({ x: 0, y: 0, width: 200, height: 100 }),
        })),
      },
      screen: {
        getPrimaryDisplay: jest.fn().mockReturnValue({
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        }),
        getDisplayMatching: jest.fn().mockReturnValue({
          bounds: { x: 10, y: 20, width: 1600, height: 900 },
        }),
      },
      getActiveDisplayAffinity: jest.fn(() => null),
      getResponseWindowBounds: jest.fn((width, height) => ({ x: 1, y: 2, width, height })),
      setResponseOverlayVisibilityState: jest.fn(),
      showResponseWindowForLiveTurnIntent: jest.fn(),
      getActiveResponseOverlayGuardRef: jest.fn(() => null),
      setActiveResponseOverlayGuardRef: jest.fn(),
      dismissResponseOverlayGuardRef: jest.fn(),
      ...overrides,
    };
  }

  test('hides response window when visible flag is false', async () => {
    const deps = createDeps();

    const result = await handleSetResponseboxSize({ visible: false }, deps);

    expect(result).toEqual({ success: true, visible: false });
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(deps.responseWindow.setBounds).not.toHaveBeenCalled();
  });

  test('records dismissed guard when renderer close sends dismissed hide', async () => {
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-close'),
    });

    const result = await handleSetResponseboxSize({
      visible: false,
      dismissed: true,
      turn_ref: 'turn-close',
      stale_guard_ref: 'turn-close',
    }, deps);

    expect(result).toEqual({ success: true, visible: false });
    expect(deps.dismissResponseOverlayGuardRef).toHaveBeenCalledWith('turn-close');
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.responseWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('does not call hide when window is already hidden', async () => {
    const deps = createDeps({
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        hide: jest.fn(),
        setBounds: jest.fn(),
      },
    });

    const result = await handleSetResponseboxSize({ visible: false }, deps);

    expect(result).toEqual({ success: true, visible: false });
    expect(deps.responseWindow.hide).not.toHaveBeenCalled();
  });

  test('logs native overlay window snapshots around renderer hide requests', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, SAMPLE_DEBUG_LIVE_SURFACE: '1' };
    configureDebugEnvRuntime(sampleDebugConfig);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const deps = createDeps();

    try {
      await handleSetResponseboxSize({
        visible: false,
        turn_ref: 'turn-close',
        stale_guard_ref: 'turn-close',
      }, deps);

      const snapshots = logSpy.mock.calls
        .filter(([marker, payload]) => (
          marker === '[LiveSurfaceTrace]'
          && payload?.event === 'response_overlay.dismiss.native_snapshot'
        ))
        .map(([, payload]) => payload);

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]).toMatchObject({
        reason: 'renderer-size-hide-before-native-hide',
        turnRef: 'turn-close',
        guardRef: 'turn-close',
        responseWindow: {
          label: 'response overlay',
          visible: true,
          destroyed: false,
          focusable: false,
          bounds: { x: 10, y: 20, width: 520, height: 236 },
        },
        chatWindow: {
          label: 'chat box',
          visible: true,
          destroyed: false,
          focusable: true,
          bounds: { x: 100, y: 200, width: 300, height: 400 },
        },
      });
      expect(snapshots[1]).toMatchObject({
        reason: 'renderer-size-hide-after-native-hide',
        turnRef: 'turn-close',
        guardRef: 'turn-close',
      });
    } finally {
      logSpy.mockRestore();
      configureDebugEnvRuntime();
      process.env = originalEnv;
    }
  });

  test('resizes in fullscreen mode using active surface display affinity from the visible chat window', async () => {
    const deps = createDeps();

    const result = await handleSetResponseboxSize({ visible: true, full_screen: true }, deps);

    expect(result).toEqual({
      success: true,
      visible: true,
      fullScreen: true,
      width: 1600,
      height: 900,
    });
    expect(deps.screen.getDisplayMatching).toHaveBeenCalledWith({ x: 100, y: 200, width: 300, height: 400 });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith(
      { x: 10, y: 20, width: 1600, height: 900 },
      false,
    );
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(true);
    expect(deps.showResponseWindowForLiveTurnIntent).toHaveBeenCalledTimes(1);
  });

  test('fullscreen falls back to primary display when no active surface affinity is available', async () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(true),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(),
      },
      mainWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(),
      },
    });

    const result = await handleSetResponseboxSize({ visible: true, full_screen: true }, deps);

    expect(result).toEqual({
      success: true,
      visible: true,
      fullScreen: true,
      width: 1920,
      height: 1080,
    });
    expect(deps.screen.getDisplayMatching).not.toHaveBeenCalled();
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 1920, height: 1080 },
      false,
    );
  });

  test('fullscreen uses stored active display affinity when no visible surface is available', async () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(),
      },
      mainWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(),
      },
      getActiveDisplayAffinity: jest.fn(() => ({
        monitor_id: '7',
        bounds: { x: -5, y: -6, width: 1280, height: 720 },
        workArea: { x: -5, y: -6, width: 1280, height: 680 },
      })),
      screen: {
        getPrimaryDisplay: jest.fn().mockReturnValue({
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        }),
        getDisplayMatching: jest.fn(),
      },
    });

    const result = await handleSetResponseboxSize({ visible: true, full_screen: true }, deps);

    expect(result).toEqual({
      success: true,
      visible: true,
      fullScreen: true,
      width: 1280,
      height: 720,
    });
    expect(deps.screen.getDisplayMatching).not.toHaveBeenCalled();
  });

  test('fullscreen ignores response overlay visibility as a monitor source', async () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(),
      },
      mainWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(),
      },
      getActiveDisplayAffinity: jest.fn(() => ({
        monitor_id: '1',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    });

    const result = await handleSetResponseboxSize({ visible: true, full_screen: true }, deps);

    expect(result).toEqual({
      success: true,
      visible: true,
      fullScreen: true,
      width: 1920,
      height: 1080,
    });
    expect(deps.screen.getDisplayMatching).not.toHaveBeenCalled();
  });

  test('resizes to bounded width and height in non-fullscreen mode', async () => {
    const deps = createDeps();

    const result = await handleSetResponseboxSize({ visible: true, width: 0, height: 9999 }, deps);

    expect(result).toEqual({ success: true, visible: true, width: 1, height: 750 });
    expect(deps.getResponseWindowBounds).toHaveBeenCalledWith(1, 750);
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 1, height: 750 }, false);
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(true);
    expect(deps.showResponseWindowForLiveTurnIntent).toHaveBeenCalledTimes(1);
  });

  test('suppresses visible resize when floating surface does not own presentation', async () => {
    const deps = createDeps({
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        hide: jest.fn(),
        setBounds: jest.fn(),
        getBounds: jest.fn().mockReturnValue({ x: 10, y: 20, width: 520, height: 236 }),
        isFocusable: jest.fn().mockReturnValue(false),
      },
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(),
      },
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-live'),
      canShowFloatingResponseOverlay: jest.fn(() => false),
    });

    const result = await handleSetResponseboxSize({
      visible: true,
      width: 320,
      height: 180,
      turn_ref: 'turn-live',
      stale_guard_ref: 'turn-live',
    }, deps);

    expect(result).toEqual({
      success: true,
      visible: false,
      ignored: true,
      reason: 'surface-not-owner',
    });
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith(null);
    expect(deps.responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(deps.responseWindow.setBounds).not.toHaveBeenCalled();
    expect(deps.showResponseWindowForLiveTurnIntent).not.toHaveBeenCalled();
  });

  test('passes compact hover flag through to response bounds helper', async () => {
    const deps = createDeps();

    const result = await handleSetResponseboxSize({
      visible: true,
      width: 300,
      height: 140,
      compact_hover: true,
    }, deps);

    expect(result).toEqual({ success: true, visible: true, width: 300, height: 140 });
    expect(deps.getResponseWindowBounds).toHaveBeenCalledWith(300, 140, { compactHover: true });
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 300, height: 140 }, false);
  });

  test('records active turn guard after a successful visible resize', async () => {
    const deps = createDeps();

    const result = await handleSetResponseboxSize({
      visible: true,
      width: 320,
      height: 180,
      turn_ref: 'turn-b',
      stale_guard_ref: 'turn-b',
    }, deps);

    expect(result).toEqual({ success: true, visible: true, width: 320, height: 180 });
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith('turn-b');
    expect(deps.showResponseWindowForLiveTurnIntent).toHaveBeenCalledTimes(1);
  });

  test('ignores stale hide from a previous turn guard', async () => {
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-b'),
    });

    const result = await handleSetResponseboxSize({
      visible: false,
      width: 0,
      height: 0,
      turn_ref: 'turn-a',
      stale_guard_ref: 'turn-a',
    }, deps);

    expect(result).toEqual({
      success: true,
      visible: true,
      ignored: true,
      reason: 'stale-hide',
    });
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(deps.responseWindow.hide).not.toHaveBeenCalled();
    expect(deps.setActiveResponseOverlayGuardRef).not.toHaveBeenCalled();
  });

  test('ignores unguarded hide while a guarded SDK response is active', async () => {
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-b'),
    });

    const result = await handleSetResponseboxSize({
      visible: false,
      width: 0,
      height: 0,
    }, deps);

    expect(result).toEqual({
      success: true,
      visible: true,
      ignored: true,
      reason: 'stale-hide',
    });
    expect(deps.setResponseOverlayVisibilityState).not.toHaveBeenCalled();
    expect(deps.responseWindow.hide).not.toHaveBeenCalled();
    expect(deps.setActiveResponseOverlayGuardRef).not.toHaveBeenCalled();
  });

  test('clears matching active turn guard on hide', async () => {
    const deps = createDeps({
      getActiveResponseOverlayGuardRef: jest.fn(() => 'turn-b'),
    });

    const result = await handleSetResponseboxSize({
      visible: false,
      width: 0,
      height: 0,
      turn_ref: 'turn-b',
      stale_guard_ref: 'turn-b',
    }, deps);

    expect(result).toEqual({ success: true, visible: false });
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(false);
    expect(deps.responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(deps.setActiveResponseOverlayGuardRef).toHaveBeenCalledWith(null);
  });

  test('returns unavailable result when response window is missing', async () => {
    const deps = createDeps({ responseWindow: null });

    const result = await handleSetResponseboxSize({ visible: true, width: 300, height: 200 }, deps);

    expect(result).toEqual({ success: false, reason: 'Response window not available' });
  });

  test('returns fullscreen error reason when bounds resolution fails', async () => {
    const deps = createDeps({
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        setBounds: jest.fn(() => {
          throw new Error('fullscreen explode');
        }),
      },
    });

    const result = await handleSetResponseboxSize({ visible: true, full_screen: true }, deps);

    expect(result).toEqual({
      success: false,
      reason: 'Failed to enter fullscreen ghost overlay: fullscreen explode',
    });
  });

  test('returns resize error reason when non-fullscreen bounds update fails', async () => {
    const deps = createDeps({
      getResponseWindowBounds: jest.fn(() => {
        throw new Error('resize explode');
      }),
    });

    const result = await handleSetResponseboxSize({ visible: true, width: 320, height: 180 }, deps);

    expect(result).toEqual({
      success: false,
      reason: 'Failed to resize response overlay: resize explode',
    });
  });
});
