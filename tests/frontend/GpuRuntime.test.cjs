/** @jest-environment node */

const {
  configureGpuRuntime,
  shouldForceSoftwareRendering,
} = require('../../frontend/src/main/gpu_runtime.cjs');

describe('gpu_runtime shouldForceSoftwareRendering', () => {
  test('treats common truthy values as enabled', () => {
    expect(shouldForceSoftwareRendering({ WINDIE_FORCE_SOFTWARE_RENDERING: '1' })).toBe(true);
    expect(shouldForceSoftwareRendering({ WINDIE_FORCE_SOFTWARE_RENDERING: 'true' })).toBe(true);
    expect(shouldForceSoftwareRendering({ WINDIE_FORCE_SOFTWARE_RENDERING: 'YES' })).toBe(true);
    expect(shouldForceSoftwareRendering({ WINDIE_FORCE_SOFTWARE_RENDERING: 'on' })).toBe(true);
  });

  test('defaults to disabled', () => {
    expect(shouldForceSoftwareRendering({})).toBe(false);
    expect(shouldForceSoftwareRendering({ WINDIE_FORCE_SOFTWARE_RENDERING: '0' })).toBe(false);
  });
});

describe('gpu_runtime configureGpuRuntime', () => {
  test('keeps hardware acceleration enabled by default', () => {
    const app = { disableHardwareAcceleration: jest.fn() };
    const env = {};

    const result = configureGpuRuntime({ app, env });

    expect(result).toEqual({ softwareRenderingForced: false });
    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(env.LIBGL_ALWAYS_SOFTWARE).toBeUndefined();
    expect(env.GALLIUM_DRIVER).toBeUndefined();
  });

  test('forces software rendering when explicit env toggle is enabled', () => {
    const app = { disableHardwareAcceleration: jest.fn() };
    const env = { WINDIE_FORCE_SOFTWARE_RENDERING: '1' };

    const result = configureGpuRuntime({ app, env });

    expect(result).toEqual({ softwareRenderingForced: true });
    expect(app.disableHardwareAcceleration).toHaveBeenCalledTimes(1);
    expect(env.LIBGL_ALWAYS_SOFTWARE).toBe('1');
    expect(env.GALLIUM_DRIVER).toBe('llvmpipe');
  });
});
