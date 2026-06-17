/** @jest-environment node */

const {
  createWindowResolvers,
  withHiddenWindowForScreenshot,
} = require('../../frontend/src/main/sidecar/local_backend_bridge_window_visibility.cjs');

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

  test('runs screenshot task without wrapper-level window visibility changes', async () => {
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
});
