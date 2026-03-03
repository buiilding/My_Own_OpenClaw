/** @jest-environment node */

const {
  configureGpuRuntime,
} = require('../../frontend/src/main/gpu_runtime.cjs');

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

  test.each(['1', 'true', 'YES', 'on'])(
    'treats truthy env value "%s" as enabled',
    (flagValue) => {
      const app = { disableHardwareAcceleration: jest.fn() };
      const env = { WINDIE_FORCE_SOFTWARE_RENDERING: flagValue };

      const result = configureGpuRuntime({ app, env });

      expect(result).toEqual({ softwareRenderingForced: true });
      expect(app.disableHardwareAcceleration).toHaveBeenCalledTimes(1);
    },
  );
});
