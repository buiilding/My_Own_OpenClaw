/** @jest-environment node */

const {
  createWindowPlatformPolicy,
  activateWindowForInteraction,
} = require('../../frontend/src/main/window_platform_policy.cjs');

describe('window_platform_policy', () => {
  test('applies overlay content protection and workspace policy through one helper', () => {
    const targetWindow = {
      setContentProtection: jest.fn(),
      setAlwaysOnTop: jest.fn(),
      setVisibleOnAllWorkspaces: jest.fn(),
    };
    const policy = createWindowPlatformPolicy({
      platform: 'darwin',
      warn: jest.fn(),
    });

    policy.applyOverlayWindowPolicy({
      targetWindow,
      windowLabel: 'chat box',
    });

    expect(targetWindow.setContentProtection).toHaveBeenCalledWith(true);
    expect(targetWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(targetWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
    });
  });

  test('activates the native window and its webContents together', () => {
    const webContents = {
      isDestroyed: jest.fn(() => false),
      focus: jest.fn(),
    };
    const targetWindow = {
      isDestroyed: jest.fn(() => false),
      moveTop: jest.fn(),
      focus: jest.fn(),
      webContents,
    };

    activateWindowForInteraction(targetWindow);

    expect(targetWindow.moveTop).toHaveBeenCalledTimes(1);
    expect(targetWindow.focus).toHaveBeenCalledTimes(1);
    expect(webContents.focus).toHaveBeenCalledTimes(1);
  });
});
