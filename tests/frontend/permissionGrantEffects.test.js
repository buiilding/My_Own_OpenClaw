/**
 * Covers permission grant effects behavior in the frontend test suite.
 */

import {
  applyPermissionGrantEffects,
  shouldPollPermissionGrantByInterval,
  shouldWatchExternalPermissionGrantCompletion,
} from '../../frontend/src/renderer/app/runtime/desktopPermissionGrantEffectsRuntime';

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

  test('keeps external grant watch policy behind the permission runtime', () => {
    expect(shouldPollPermissionGrantByInterval('screen_capture')).toBe(true);
    expect(shouldPollPermissionGrantByInterval('browser_automation')).toBe(false);

    expect(shouldWatchExternalPermissionGrantCompletion('screen_capture', {
      status: 'needs-action',
      granted: false,
    })).toBe(true);
    expect(shouldWatchExternalPermissionGrantCompletion('screen_capture', {
      status: 'needs-action',
      granted: false,
      details: { media_status: 'granted' },
    })).toBe(false);
    expect(shouldWatchExternalPermissionGrantCompletion('screen_capture', {
      status: 'granted',
      granted: true,
    })).toBe(false);
    expect(shouldWatchExternalPermissionGrantCompletion('browser_automation', {
      status: 'needs-action',
      granted: false,
    })).toBe(false);
  });
});
