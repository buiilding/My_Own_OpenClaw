/** @jest-environment node */

jest.mock('electron', () => ({
  nativeImage: {
    createFromPath: jest.fn(() => ({ isEmpty: () => false })),
    createFromDataURL: jest.fn(() => ({ isEmpty: () => false })),
  },
}));

const {
  resolveAppIconNativeImage,
  resolveAppIconPathRuntime,
  resolveTrayIconNativeImage,
} = require('../../frontend/src/main/main_window_icon_runtime.cjs');

describe('main_window_icon_runtime', () => {
  test('resolveAppIconPathRuntime returns the first existing candidate', () => {
    const existsSync = jest.fn((candidate) => candidate.includes('/cwd/'));

    expect(resolveAppIconPathRuntime({
      existsSync,
      resourcesPath: '/resources',
      cwd: '/cwd',
    })).toContain('/cwd/');
  });

  test('resolveAppIconNativeImage returns null when no path resolves', () => {
    expect(resolveAppIconNativeImage({
      resolveAppIconPath: () => null,
    })).toBeNull();
  });

  test('resolveTrayIconNativeImage falls back to data-url image when path is unreadable', () => {
    const { nativeImage } = require('electron');
    nativeImage.createFromPath.mockReturnValueOnce({ isEmpty: () => true });

    const icon = resolveTrayIconNativeImage({
      iconPath: '/tmp/missing.png',
      warn: jest.fn(),
    });

    expect(nativeImage.createFromDataURL).toHaveBeenCalled();
    expect(icon).toEqual(expect.objectContaining({ isEmpty: expect.any(Function) }));
  });
});
