/** @jest-environment node */

const {
  getOverlayAlwaysOnTopLevels,
  setOverlayAlwaysOnTop,
} = require('../../frontend/src/main/overlay_topmost_runtime.cjs');

describe('overlay_topmost_runtime', () => {
  test('prefers screen-saver level on macOS before floating fallback', () => {
    expect(getOverlayAlwaysOnTopLevels('darwin')).toEqual(['screen-saver', 'floating']);
  });

  test('uses floating level on non-mac platforms', () => {
    expect(getOverlayAlwaysOnTopLevels('linux')).toEqual(['floating']);
    expect(getOverlayAlwaysOnTopLevels('win32')).toEqual(['floating']);
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
});
