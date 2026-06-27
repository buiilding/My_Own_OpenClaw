/**
 * Covers permission grant effects behavior in the frontend test suite.
 */

import {
  DesktopPermissionGrantEffectsRuntime,
} from '../../src/renderer/app/runtime/desktopPermissionGrantEffectsRuntime';

const {
  applyPermissionGrantEffects,
  createExternalPermissionGrantWatcher,
  shouldPollPermissionGrantByInterval,
  shouldWatchExternalPermissionGrantCompletion,
} = DesktopPermissionGrantEffectsRuntime;

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

  test('external grant watcher polls and rechecks when renderer attention returns', async () => {
    const listeners = new Map();
    let intervalHandler = null;
    const runPermissionProbe = jest.fn().mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });
    const setWaitingPermissionId = jest.fn();
    const windowTarget = {
      addEventListener: jest.fn((eventName, handler) => {
        listeners.set(`window:${eventName}`, handler);
      }),
      removeEventListener: jest.fn(),
      setInterval: jest.fn((handler) => {
        intervalHandler = handler;
        return 42;
      }),
      clearInterval: jest.fn(),
    };
    const documentTarget = {
      hidden: false,
      addEventListener: jest.fn((eventName, handler) => {
        listeners.set(`document:${eventName}`, handler);
      }),
      removeEventListener: jest.fn(),
    };
    const watcher = createExternalPermissionGrantWatcher({
      runPermissionProbe,
      setWaitingPermissionId,
      windowTarget,
      documentTarget,
    });

    watcher.start('screen_capture');
    await Promise.resolve();

    expect(setWaitingPermissionId).toHaveBeenCalledWith('screen_capture');
    expect(windowTarget.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(runPermissionProbe).toHaveBeenCalledTimes(1);

    listeners.get('window:focus')();
    await Promise.resolve();
    expect(runPermissionProbe).toHaveBeenCalledTimes(2);

    documentTarget.hidden = true;
    listeners.get('document:visibilitychange')();
    await Promise.resolve();
    expect(runPermissionProbe).toHaveBeenCalledTimes(2);

    intervalHandler();
    await Promise.resolve();
    expect(runPermissionProbe).toHaveBeenCalledTimes(3);

    watcher.dispose();
    expect(windowTarget.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(documentTarget.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(windowTarget.clearInterval).toHaveBeenCalledWith(42);
  });

  test('external grant watcher clears waiting state when the grant lands', async () => {
    const runPermissionProbe = jest.fn().mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'granted',
    });
    const setWaitingPermissionId = jest.fn();
    const windowTarget = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      setInterval: jest.fn(() => 7),
      clearInterval: jest.fn(),
    };
    const watcher = createExternalPermissionGrantWatcher({
      runPermissionProbe,
      setWaitingPermissionId,
      windowTarget,
      documentTarget: { hidden: false },
    });

    watcher.start('screen_capture');
    await Promise.resolve();

    expect(setWaitingPermissionId).toHaveBeenNthCalledWith(1, 'screen_capture');
    expect(setWaitingPermissionId).toHaveBeenNthCalledWith(2, '');
    expect(windowTarget.clearInterval).toHaveBeenCalledWith(7);
    expect(watcher.getWatchedPermissionId()).toBe('');
  });
});
