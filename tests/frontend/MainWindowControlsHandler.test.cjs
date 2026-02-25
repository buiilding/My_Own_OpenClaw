/** @jest-environment node */

const {
  handleWindowClose,
  handleWindowMinimize,
  handleWindowToggleMaximize,
} = require('../../frontend/src/main/main_window_controls_handler.cjs');

describe('main_window_controls_handler', () => {
  function createWindow(overrides = {}) {
    return {
      isDestroyed: jest.fn().mockReturnValue(false),
      minimize: jest.fn(),
      close: jest.fn(),
      maximize: jest.fn(),
      unmaximize: jest.fn(),
      isMaximized: jest.fn().mockReturnValue(false),
      ...overrides,
    };
  }

  test('minimize returns unavailable result when main window is missing', () => {
    const result = handleWindowMinimize({ mainWindow: null });
    expect(result).toEqual({ success: false, reason: 'Main window not available' });
  });

  test('minimize runs when main window is available', () => {
    const mainWindow = createWindow();
    const result = handleWindowMinimize({ mainWindow });
    expect(result).toEqual({ success: true });
    expect(mainWindow.minimize).toHaveBeenCalledTimes(1);
  });

  test('toggle-maximize returns unavailable payload when window missing', () => {
    const result = handleWindowToggleMaximize({ mainWindow: null });
    expect(result).toEqual({
      success: false,
      reason: 'Main window not available',
      isMaximized: false,
    });
  });

  test('toggle-maximize runs maximize when currently not maximized', () => {
    const mainWindow = createWindow({
      isMaximized: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true),
    });
    const result = handleWindowToggleMaximize({ mainWindow });
    expect(mainWindow.maximize).toHaveBeenCalledTimes(1);
    expect(mainWindow.unmaximize).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, isMaximized: true });
  });

  test('toggle-maximize runs unmaximize when currently maximized', () => {
    const mainWindow = createWindow({
      isMaximized: jest
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
    });
    const result = handleWindowToggleMaximize({ mainWindow });
    expect(mainWindow.unmaximize).toHaveBeenCalledTimes(1);
    expect(mainWindow.maximize).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, isMaximized: false });
  });

  test('close returns unavailable when main window is destroyed', () => {
    const mainWindow = createWindow({
      isDestroyed: jest.fn().mockReturnValue(true),
    });
    const result = handleWindowClose({ mainWindow });
    expect(result).toEqual({ success: false, reason: 'Main window not available' });
    expect(mainWindow.close).not.toHaveBeenCalled();
  });

  test('close runs when main window is available', () => {
    const mainWindow = createWindow();
    const result = handleWindowClose({ mainWindow });
    expect(result).toEqual({ success: true });
    expect(mainWindow.close).toHaveBeenCalledTimes(1);
  });
});
