/** @jest-environment node */

const {
  createWindowResolvers,
  withHiddenWindowForScreenshot,
} = require('../../frontend/src/main/local_backend_bridge_window_visibility.cjs');

describe('local_backend_bridge_window_visibility', () => {
  test('normalizes object-style window providers', () => {
    const mainWindow = { id: 'main' };
    const chatWindow = { id: 'chat' };
    const responseWindow = { id: 'response' };

    const resolvers = createWindowResolvers({
      mainWindow,
      chatWindow,
      responseWindow,
    });

    expect(resolvers.resolveWindows()).toEqual([mainWindow, chatWindow, responseWindow]);
    expect(resolvers.resolveChatWindow()).toBe(chatWindow);
    expect(resolvers.resolveResponseWindow()).toBe(responseWindow);
  });

  test('uses no-op screenshot visibility runtime on Windows', async () => {
    const task = jest.fn().mockResolvedValue({ success: true });
    const resolveWindows = jest.fn(() => []);

    const result = await withHiddenWindowForScreenshot({
      platform: 'win32',
      task,
      resolveWindows,
      resolveChatWindow: jest.fn(() => null),
      resolveResponseWindow: jest.fn(() => null),
    });

    expect(result).toEqual({ success: true });
    expect(task).toHaveBeenCalledTimes(1);
    expect(resolveWindows).not.toHaveBeenCalled();
  });

  test('hides and restores visible windows on Linux screenshots', async () => {
    jest.useFakeTimers();
    try {
      const mainWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        isFocused: jest.fn().mockReturnValue(true),
        isMinimized: jest.fn().mockReturnValue(false),
        hide: jest.fn(),
        show: jest.fn(),
        focus: jest.fn(),
      };
      const chatWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        isVisible: jest.fn().mockReturnValue(true),
        isFocused: jest.fn().mockReturnValue(false),
        isMinimized: jest.fn().mockReturnValue(false),
        hide: jest.fn(),
        showInactive: jest.fn(),
        setAlwaysOnTop: jest.fn(),
        moveTop: jest.fn(),
        blur: jest.fn(),
      };
      const task = jest.fn().mockResolvedValue({ success: true });

      const pending = withHiddenWindowForScreenshot({
        platform: 'linux',
        task,
        resolveWindows: () => [mainWindow, chatWindow],
        resolveChatWindow: () => chatWindow,
        resolveResponseWindow: () => null,
      });

      expect(mainWindow.hide).toHaveBeenCalledTimes(1);
      expect(chatWindow.hide).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(320);
      const result = await pending;

      expect(result).toEqual({ success: true });
      expect(task).toHaveBeenCalledTimes(1);
      expect(mainWindow.show).toHaveBeenCalledTimes(1);
      expect(chatWindow.showInactive).toHaveBeenCalledTimes(1);
      expect(chatWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
      expect(chatWindow.moveTop).toHaveBeenCalledTimes(1);
      expect(mainWindow.focus).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
