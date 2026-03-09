/** @jest-environment node */

const {
  listPermissionsWithStatus,
  requestPermission,
  resetPermissionRequestStateForTests,
  runPermissionProbe,
} = require('../../frontend/src/main/permission_service.cjs');

describe('permission_service', () => {
  beforeEach(() => {
    resetPermissionRequestStateForTests();
  });

  test('returns manifest snapshot with per-permission status entries', () => {
    const result = listPermissionsWithStatus({ platform: 'linux' });

    expect(typeof result.manifest_version).toBe('string');
    expect(Array.isArray(result.permissions)).toBe(true);
    expect(Array.isArray(result.statuses)).toBe(true);
    expect(result.permissions.length).toBeGreaterThan(0);
    expect(result.statuses).toHaveLength(result.permissions.length);
  });

  test('screen capture probe on macOS requires action when screen access missing', () => {
    const status = runPermissionProbe('screen_capture', {
      platform: 'darwin',
      systemPreferences: {
        getMediaAccessStatus: jest.fn(() => 'denied'),
      },
    });

    expect(status.permission_id).toBe('screen_capture');
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
  });

  test('microphone request invokes askForMediaAccess then re-probes status', async () => {
    const askForMediaAccess = jest.fn(async () => true);
    const getMediaAccessStatus = jest.fn(() => 'granted');
    const focusPermissionPromptWindow = jest.fn(async () => ({ success: true }));

    const status = await requestPermission('microphone', {
      platform: 'darwin',
      systemPreferences: {
        askForMediaAccess,
        getMediaAccessStatus,
      },
      focusPermissionPromptWindow,
    });

    expect(askForMediaAccess).toHaveBeenCalledWith('microphone');
    expect(focusPermissionPromptWindow).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('microphone request on macOS falls back to renderer media prompt when native prompt fails', async () => {
    const askForMediaAccess = jest.fn(async () => false);
    const requestRendererMicrophoneAccess = jest.fn(async () => ({ success: true }));
    const focusPermissionPromptWindow = jest.fn(async () => ({ success: true }));
    const openExternal = jest.fn(async () => true);
    const getMediaAccessStatus = jest.fn(() => 'granted');

    const status = await requestPermission('microphone', {
      platform: 'darwin',
      shell: {
        openExternal,
      },
      systemPreferences: {
        askForMediaAccess,
        getMediaAccessStatus,
      },
      focusPermissionPromptWindow,
      requestRendererMicrophoneAccess,
    });

    expect(askForMediaAccess).toHaveBeenCalledWith('microphone');
    expect(focusPermissionPromptWindow).toHaveBeenCalledTimes(1);
    expect(requestRendererMicrophoneAccess).toHaveBeenCalledTimes(1);
    expect(openExternal).not.toHaveBeenCalled();
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('filesystem access starts as needs-action and becomes granted after folder picker selection', async () => {
    const initial = runPermissionProbe('filesystem_workspace_access', {
      platform: 'linux',
    });
    expect(initial.status).toBe('needs-action');
    expect(initial.granted).toBe(false);

    const status = await requestPermission('filesystem_workspace_access', {
      platform: 'linux',
      dialog: {
        showOpenDialog: jest.fn(async () => ({
          canceled: false,
          filePaths: ['/tmp/windieos-workspace'],
        })),
      },
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('shell execution grant flow can be satisfied through elevated command prompt', async () => {
    const runCommand = jest.fn(async () => ({
      success: true,
      code: 0,
      stdout: '',
      stderr: '',
    }));

    const status = await requestPermission('shell_execution', {
      platform: 'linux',
      runCommand,
    });

    expect(runCommand).toHaveBeenCalled();
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('linux screen capture grant depends on desktop capture prompt success', async () => {
    const runCommand = jest.fn(async () => ({
      success: true,
      code: 0,
      stdout: '',
      stderr: '',
    }));
    const grantedStatus = await requestPermission('screen_capture', {
      platform: 'linux',
      desktopCapturer: {
        getSources: jest.fn(async () => ([])),
      },
      runCommand,
    });

    expect(grantedStatus.status).toBe('granted');
    expect(grantedStatus.granted).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();

    resetPermissionRequestStateForTests();
    const deniedStatus = await requestPermission('screen_capture', {
      platform: 'linux',
      desktopCapturer: {
        getSources: jest.fn(async () => {
          throw new Error('portal canceled');
        }),
      },
      runCommand,
    });

    expect(deniedStatus.status).toBe('needs-action');
    expect(deniedStatus.granted).toBe(false);
    expect(String(deniedStatus.reason || '')).toContain('Screen capture was not granted');
    expect(runCommand).not.toHaveBeenCalled();
  });

  test('linux input control grant does not auto-complete when settings page opens', async () => {
    const runCommand = jest.fn(async () => ({
      success: true,
      code: 0,
      stdout: '',
      stderr: '',
    }));

    const status = await requestPermission('input_control_accessibility', {
      platform: 'linux',
      runCommand,
      verifyInputControlCapability: jest.fn(async () => ({ granted: false })),
    });

    expect(runCommand).toHaveBeenCalled();
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
  });

  test('linux microphone grant does not auto-complete when settings page opens', async () => {
    const runCommand = jest.fn(async () => ({
      success: true,
      code: 0,
      stdout: '',
      stderr: '',
    }));

    const status = await requestPermission('microphone', {
      platform: 'linux',
      runCommand,
      verifyMicrophoneCapability: jest.fn(async () => ({ granted: false })),
    });

    expect(runCommand).toHaveBeenCalled();
    expect(runCommand).toHaveBeenCalledWith(
      'xdg-open',
      ['settings://privacy'],
      expect.any(Object),
    );
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
  });

  test('linux input control can become granted after verifier passes', async () => {
    const status = await requestPermission('input_control_accessibility', {
      platform: 'linux',
      verifyInputControlCapability: jest.fn(async () => ({ granted: true })),
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('linux microphone can become granted after verifier passes', async () => {
    const status = await requestPermission('microphone', {
      platform: 'linux',
      verifyMicrophoneCapability: jest.fn(async () => ({ granted: true })),
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('windows screen capture is not granted by settings-open fallback alone', async () => {
    const status = await requestPermission('screen_capture', {
      platform: 'win32',
      desktopCapturer: {
        getSources: jest.fn(async () => {
          throw new Error('capture denied');
        }),
      },
      shell: {
        openExternal: jest.fn(async () => true),
      },
    });

    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
  });

  test('browser automation probe reflects frontend enable preference', () => {
    const disabled = runPermissionProbe('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => false,
    });
    expect(disabled.status).toBe('needs-action');
    expect(disabled.granted).toBe(false);

    const enabled = runPermissionProbe('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => true,
    });
    expect(enabled.status).toBe('granted');
    expect(enabled.granted).toBe(true);
  });

  test('browser automation request returns needs-action when capability check fails', async () => {
    const status = await requestPermission('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => false,
      verifyBrowserAutomationCapability: jest.fn(async () => ({
        granted: false,
        reason: 'Runtime pack unavailable.',
      })),
    });

    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(String(status.reason || '')).toContain('Runtime pack unavailable');
  });

  test('browser automation request can be granted after capability check succeeds', async () => {
    const status = await requestPermission('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => true,
      verifyBrowserAutomationCapability: jest.fn(async () => ({
        granted: true,
        details: { browser_feature_pack_available: true },
      })),
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
    expect(status.details.browser_automation_enabled).toBe(true);
  });

  test('browser automation request installs chromium when missing and consented', async () => {
    const verifyBrowserAutomationCapability = jest
      .fn()
      .mockResolvedValueOnce({
        granted: false,
        reason: 'Chromium runtime missing.',
        details: { missing_browser_binary: true },
      })
      .mockResolvedValueOnce({
        granted: true,
        details: { browser_binary_available: true },
      });
    const installBrowserAutomationRuntime = jest.fn(async () => ({
      success: true,
      details: { installed: true },
    }));
    const showMessageBox = jest.fn(async () => ({ response: 0 }));

    const status = await requestPermission('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => true,
      verifyBrowserAutomationCapability,
      installBrowserAutomationRuntime,
      dialog: { showMessageBox },
    });

    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(installBrowserAutomationRuntime).toHaveBeenCalledTimes(1);
    expect(verifyBrowserAutomationCapability).toHaveBeenCalledTimes(2);
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('browser automation request stays needs-action when chromium install is declined', async () => {
    const verifyBrowserAutomationCapability = jest.fn(async () => ({
      granted: false,
      reason: 'Chromium runtime missing.',
      details: { missing_browser_binary: true },
    }));
    const installBrowserAutomationRuntime = jest.fn(async () => ({ success: true }));
    const showMessageBox = jest.fn(async () => ({ response: 1 }));

    const status = await requestPermission('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => false,
      verifyBrowserAutomationCapability,
      installBrowserAutomationRuntime,
      dialog: { showMessageBox },
    });

    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(installBrowserAutomationRuntime).not.toHaveBeenCalled();
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(String(status.reason || '')).toContain('canceled');
  });

  test('unknown permission id returns error status', () => {
    const status = runPermissionProbe('unknown_permission', { platform: 'linux' });
    expect(status.status).toBe('error');
    expect(status.granted).toBe(false);
  });
});
