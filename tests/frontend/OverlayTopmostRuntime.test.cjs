/** @jest-environment node */

const {
  setOverlayAlwaysOnTop,
  setOverlayVisibleOnAllWorkspaces,
} = require('../../frontend/src/main/overlay_topmost_runtime.cjs');

describe('overlay_topmost_runtime', () => {
  test('tries strongest topmost level before fallback', () => {
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
    expect(targetWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true, 'screen-saver');
  });

  test('falls back to floating when screen-saver level throws', () => {
    const targetWindow = {
      setAlwaysOnTop: jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('unsupported level');
        })
        .mockImplementationOnce(() => {}),
    };

    const success = setOverlayAlwaysOnTop({
      targetWindow,
      platform: 'darwin',
      warn: jest.fn(),
      windowLabel: 'chat box',
    });

    expect(success).toBe(true);
    expect(targetWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true, 'screen-saver');
    expect(targetWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(2, true, 'floating');
  });

  test('pins overlay across all workspaces and fullscreen spaces on macOS', () => {
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
    expect(targetWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
  });

  test('falls back to default workspace options when mac skipTransform flag is unsupported', () => {
    const targetWindow = {
      setVisibleOnAllWorkspaces: jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('unsupported option');
        })
        .mockImplementationOnce(() => {}),
    };

    const success = setOverlayVisibleOnAllWorkspaces({
      targetWindow,
      platform: 'darwin',
      warn: jest.fn(),
      windowLabel: 'chat box',
    });

    expect(success).toBe(true);
    expect(targetWindow.setVisibleOnAllWorkspaces).toHaveBeenNthCalledWith(1, true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    expect(targetWindow.setVisibleOnAllWorkspaces).toHaveBeenNthCalledWith(2, true, {
      visibleOnFullScreen: true,
    });
  });
});
