/** @jest-environment node */

jest.mock('electron', () => ({
  nativeImage: {
    createFromPath: jest.fn(() => ({ isEmpty: () => false })),
    createFromDataURL: jest.fn(() => ({ isEmpty: () => false })),
  },
}));

const {
  createMainWindowIconRuntime,
} = require('../../src/main/surfaces/main_window_icon_runtime.cjs');

describe('main_window_icon_runtime', () => {
  const iconRuntime = createMainWindowIconRuntime();

  test('createMainWindowIconRuntime keeps lower-level icon helpers private', () => {
    const iconRuntimeModule = require('../../src/main/surfaces/main_window_icon_runtime.cjs');

    expect(typeof iconRuntime.resolveAppIconPath).toBe('function');
    expect(typeof iconRuntime.resolveAppIcon).toBe('function');
    expect(typeof iconRuntime.resolveTrayIcon).toBe('function');
    expect(iconRuntimeModule.resolveAppIconPathRuntime).toBeUndefined();
    expect(iconRuntimeModule.resolveAppIconNativeImage).toBeUndefined();
    expect(iconRuntimeModule.resolveTrayIconNativeImage).toBeUndefined();
  });

  test('resolveAppIconPath returns the first existing configured icon candidate', () => {
    const existsSync = jest.fn((candidate) => String(candidate).includes('cwd')
      && String(candidate).includes('brand.app.png'));

    expect(iconRuntime.resolveAppIconPath({
      existsSync,
      resourcesPath: '/resources',
      cwd: '/cwd',
      iconFileName: 'brand.app.png',
    })).toBe(require('path').join('/cwd', 'src', 'main', 'assets', 'icons', 'brand.app.png'));
  });

  test('resolveAppIconPath keeps configured icon resolution inside the icon asset folder', () => {
    const existsSync = jest.fn((candidate) => String(candidate).endsWith(
      require('path').join('icons', 'brand.png'),
    ));

    const resolvedPath = iconRuntime.resolveAppIconPath({
      existsSync,
      resourcesPath: '',
      cwd: '/cwd',
      iconFileName: '../brand.png',
    });

    expect(resolvedPath).toEqual(expect.stringContaining(
      require('path').join('assets', 'icons', 'brand.png'),
    ));
    expect(resolvedPath).not.toContain('..');
  });

  test('resolveAppIcon returns null when no path resolves', () => {
    expect(iconRuntime.resolveAppIcon({
      resolveAppIconPath: () => null,
    })).toBeNull();
  });

  test('resolveTrayIcon falls back to data-url image when path is unreadable', () => {
    const { nativeImage } = require('electron');
    nativeImage.createFromPath.mockReturnValueOnce({ isEmpty: () => true });

    const icon = iconRuntime.resolveTrayIcon({
      iconPath: '/tmp/missing.png',
      warn: jest.fn(),
    });

    expect(nativeImage.createFromDataURL).toHaveBeenCalled();
    expect(icon).toEqual(expect.objectContaining({ isEmpty: expect.any(Function) }));
  });
});
