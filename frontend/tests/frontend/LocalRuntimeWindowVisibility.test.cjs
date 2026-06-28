/** @jest-environment node */

const {
  createLocalRuntimeWindowVisibilityRuntime,
} = require('../../src/main/sidecar/local_runtime_window_visibility.cjs');
const fs = require('fs');
const path = require('path');

const screenshotVisibilityReferencePath = path.resolve(
  __dirname,
  '../../docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md',
);

describe('local_runtime_window_visibility', () => {
  test('normalizes object-style window providers', () => {
    const mainWindow = { id: 'main' };
    const chatWindow = { id: 'chat' };
    const responseWindow = { id: 'response' };

    const visibilityRuntime = createLocalRuntimeWindowVisibilityRuntime({
      mainWindow,
      chatWindow,
      responseWindow,
    });

    expect(visibilityRuntime.resolveWindows()).toEqual([mainWindow, chatWindow, responseWindow]);
    expect(visibilityRuntime.resolveChatWindow()).toBe(chatWindow);
    expect(visibilityRuntime.resolveResponseWindow()).toBe(responseWindow);
  });

  test('runs screenshot task without wrapper-level window visibility changes', async () => {
    const visibilityModule = require('../../src/main/sidecar/local_runtime_window_visibility.cjs');
    const visibilityRuntime = createLocalRuntimeWindowVisibilityRuntime();
    const task = jest.fn().mockResolvedValue({ success: true });
    const resolveWindows = jest.fn(() => []);

    expect(visibilityModule.createWindowResolvers).toBeUndefined();
    expect(visibilityModule.withHiddenWindowForScreenshot).toBeUndefined();
    const result = await visibilityRuntime.withHiddenWindowForScreenshot({
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

  test('screenshot visibility docs use local-runtime execution wording', () => {
    const source = fs
      .readFileSync(screenshotVisibilityReferencePath, 'utf8')
      .replace(/\r\n/g, '\n');

    expect(source).toContain('before invoking\n  the local runtime');
    expect(source).not.toContain('before invoking the\n  sidecar');
    expect(source).not.toContain('before invoking the sidecar');
  });
});
