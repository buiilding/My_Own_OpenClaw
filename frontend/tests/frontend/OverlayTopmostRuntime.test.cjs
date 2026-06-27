/** @jest-environment node */

const {
  setOverlayAlwaysOnTop,
  setOverlayVisibleOnAllWorkspaces,
} = require('../../src/main/surfaces/overlay_topmost_runtime.cjs');

describe('overlay_topmost_runtime', () => {
  test('uses capturable floating level for normal macOS overlays', () => {
    const targetWindow = {
      setAlwaysOnTop: jest.fn(() => {}),
    };

    const success = setOverlayAlwaysOnTop({
      targetWindow,
      platform: 'darwin',
      warn: jest.fn(),
      windowLabel: 'chat box',
    });

    expect(success).toBe(true);
    expect(targetWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true, 'floating');
  });

  test('falls back to floating when non-mac screen-saver level throws', () => {
    const targetWindow = {
      setAlwaysOnTop: jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('unsupported level');
        })
        .mockImplementationOnce(() => {}),
    };

    const success = setOverlayAlwaysOnTop({
      targetWindow,
      platform: 'win32',
      warn: jest.fn(),
      windowLabel: 'chat box',
    });

    expect(success).toBe(true);
    expect(targetWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true, 'screen-saver');
    expect(targetWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(2, true, 'floating');
  });

  test('skips workspace pinning calls on macOS panels', () => {
    const targetWindow = {
      setVisibleOnAllWorkspaces: jest.fn(),
    };

    const success = setOverlayVisibleOnAllWorkspaces({
      targetWindow,
      platform: 'darwin',
      warn: jest.fn(),
      windowLabel: 'chat box',
    });

    expect(success).toBe(true);
    expect(targetWindow.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
  });

  test('warns when non-mac workspace pinning fails', () => {
    const targetWindow = {
      setVisibleOnAllWorkspaces: jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('unsupported option');
        }),
    };
    const warn = jest.fn();

    const success = setOverlayVisibleOnAllWorkspaces({
      targetWindow,
      platform: 'win32',
      warn,
      windowLabel: 'chat box',
    });

    expect(success).toBe(false);
    expect(targetWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
    });
    expect(warn).toHaveBeenCalledWith(
      '[Main] Failed to pin chat box across workspaces/fullscreen:',
      'unsupported option',
    );
  });
});
