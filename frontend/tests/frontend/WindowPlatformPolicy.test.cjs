/** @jest-environment node */

const {
  createWindowPlatformPolicy,
} = require('../../src/main/surfaces/window_platform_policy.cjs');

describe('window_platform_policy', () => {
  test('applies mac overlay topmost/workspace policy without forcing content protection', () => {
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

    expect(targetWindow.setContentProtection).not.toHaveBeenCalled();
    expect(targetWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
    expect(targetWindow.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
  });

  test('applies content protection explicitly when requested', () => {
    const targetWindow = {
      setContentProtection: jest.fn(),
    };
    const policy = createWindowPlatformPolicy({
      platform: 'darwin',
      warn: jest.fn(),
    });

    policy.applyContentProtection({
      targetWindow,
      windowLabel: 'chat box',
      enabled: true,
    });

    expect(targetWindow.setContentProtection).toHaveBeenCalledWith(true);
  });

  test('keeps linux content protection as a no-op', () => {
    const targetWindow = {
      setContentProtection: jest.fn(),
    };
    const policy = createWindowPlatformPolicy({
      platform: 'linux',
      warn: jest.fn(),
    });

    policy.applyContentProtection({
      targetWindow,
      windowLabel: 'chat box',
      enabled: true,
    });

    expect(targetWindow.setContentProtection).not.toHaveBeenCalled();
  });

  test('activates the native window and its webContents together', () => {
    const policyModule = require('../../src/main/surfaces/window_platform_policy.cjs');
    const policy = createWindowPlatformPolicy();
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

    expect(policyModule.activateWindowForInteraction).toBeUndefined();
    policy.activateWindowForInteraction(targetWindow);

    expect(targetWindow.moveTop).toHaveBeenCalledTimes(1);
    expect(targetWindow.focus).toHaveBeenCalledTimes(1);
    expect(webContents.focus).toHaveBeenCalledTimes(1);
  });
});
