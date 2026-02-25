/** @jest-environment node */

const {
  handleSetResponseboxSize,
} = require('../../frontend/src/main/overlay_responsebox_handler.cjs');

describe('overlay_responsebox_handler', () => {
  function createDeps(overrides = {}) {
    return {
      responseWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        hide: jest.fn(),
        setBounds: jest.fn(),
      },
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(false),
        getBounds: jest.fn().mockReturnValue({ x: 100, y: 200, width: 300, height: 400 }),
      },
      screen: {
        getPrimaryDisplay: jest.fn().mockReturnValue({
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        }),
        getDisplayMatching: jest.fn().mockReturnValue({
          bounds: { x: 10, y: 20, width: 1600, height: 900 },
        }),
      },
      getResponseWindowBounds: jest.fn((width, height) => ({ x: 1, y: 2, width, height })),
      setResponseOverlayVisibilityState: jest.fn(),
      showResponseWindowWhenChatVisible: jest.fn(),
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

  test('resizes in fullscreen mode using display that matches chat window', async () => {
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
    expect(deps.showResponseWindowWhenChatVisible).toHaveBeenCalledTimes(1);
  });

  test('fullscreen falls back to primary display when chat window is unavailable', async () => {
    const deps = createDeps({
      chatWindow: {
        isDestroyed: jest.fn().mockReturnValue(true),
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

  test('fullscreen uses primary display when getDisplayMatching is absent', async () => {
    const deps = createDeps({
      screen: {
        getPrimaryDisplay: jest.fn().mockReturnValue({
          bounds: { x: -5, y: -6, width: 1280, height: 720 },
        }),
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
  });

  test('resizes to bounded width and height in non-fullscreen mode', async () => {
    const deps = createDeps();

    const result = await handleSetResponseboxSize({ visible: true, width: 0, height: 9999 }, deps);

    expect(result).toEqual({ success: true, visible: true, width: 1, height: 750 });
    expect(deps.getResponseWindowBounds).toHaveBeenCalledWith(1, 750);
    expect(deps.responseWindow.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 1, height: 750 }, false);
    expect(deps.setResponseOverlayVisibilityState).toHaveBeenCalledWith(true);
    expect(deps.showResponseWindowWhenChatVisible).toHaveBeenCalledTimes(1);
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
