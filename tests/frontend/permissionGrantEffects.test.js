import { applyPermissionGrantEffects } from '../../frontend/src/renderer/features/permissions/utils/permissionGrantEffects';

describe('applyPermissionGrantEffects', () => {
  test('enables browser automation in config after a granted browser permission', () => {
    const updateConfig = jest.fn();

    applyPermissionGrantEffects({
      permissionId: 'browser_automation',
      status: { granted: true },
      updateConfig,
    });

    expect(updateConfig).toHaveBeenCalledWith({ browser_automation_enabled: true });
  });

  test('ignores unrelated or denied permission grants', () => {
    const updateConfig = jest.fn();

    applyPermissionGrantEffects({
      permissionId: 'screen_capture',
      status: { granted: true },
      updateConfig,
    });
    applyPermissionGrantEffects({
      permissionId: 'browser_automation',
      status: { granted: false },
      updateConfig,
    });

    expect(updateConfig).not.toHaveBeenCalled();
  });
});
