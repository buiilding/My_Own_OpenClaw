/** @jest-environment node */

jest.mock('electron', () => ({
  nativeImage: {
    createFromPath: jest.fn(() => ({ isEmpty: () => false })),
    createFromDataURL: jest.fn(() => ({ isEmpty: () => false })),
  },
}));

const {
  normalizeIconFileName,
  resolveAppIconNativeImage,
  resolveAppIconPathRuntime,
  resolveTrayIconNativeImage,
} = require('../../frontend/src/main/surfaces/main_window_icon_runtime.cjs');

describe('main_window_icon_runtime', () => {
  test('resolveAppIconPathRuntime returns the first existing configured icon candidate', () => {
    const existsSync = jest.fn((candidate) => String(candidate).includes('cwd')
      && String(candidate).includes('brand.app.png'));

    expect(resolveAppIconPathRuntime({
      existsSync,
      resourcesPath: '/resources',
      cwd: '/cwd',
      iconFileName: 'brand.app.png',
    })).toBe(require('path').join('/cwd', 'src', 'main', 'assets', 'icons', 'brand.app.png'));
  });

  test('normalizeIconFileName keeps icon resolution inside the icon asset folder', () => {
    expect(normalizeIconFileName('../brand.png')).toBe('brand.png');
    expect(normalizeIconFileName('')).toBe('app.png');
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
