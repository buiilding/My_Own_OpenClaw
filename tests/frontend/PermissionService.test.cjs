/** @jest-environment node */

const {
  listPermissionsWithStatus,
  requestPermission,
  runPermissionProbe,
} = require('../../frontend/src/main/permission_service.cjs');

function createMockPermissionStateStore() {
  const state = new Map();
  return {
    get: jest.fn(async (permissionId) => state.get(permissionId) || null),
    set: jest.fn(async (permissionId, entry) => {
      state.set(permissionId, entry);
      return entry;
    }),
    delete: jest.fn(async (permissionId) => state.delete(permissionId)),
  };
}

describe('permission_service', () => {
  let permissionStateStore;

  beforeEach(() => {
    permissionStateStore = createMockPermissionStateStore();
  });

  test('returns manifest snapshot with per-permission status entries', async () => {
    const result = await listPermissionsWithStatus({
      platform: 'linux',
      permissionStateStore,
      verifyBrowserAutomationCapability: jest.fn(async () => ({ granted: false })),
    });

    expect(typeof result.manifest_version).toBe('string');
    expect(Array.isArray(result.permissions)).toBe(true);
    expect(Array.isArray(result.statuses)).toBe(true);
    expect(result.permissions.length).toBeGreaterThan(0);
    expect(result.statuses).toHaveLength(result.permissions.length);
  });

  test('screen capture probe on macOS requires action when screen access missing', async () => {
    const status = await runPermissionProbe('screen_capture', {
      platform: 'darwin',
      systemPreferences: {
        getMediaAccessStatus: jest.fn(() => 'denied'),
      },
    });

    expect(status.permission_id).toBe('screen_capture');
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
  });

  test('screen capture request on macOS verifies the real screenshot path before granting', async () => {
    const openExternal = jest.fn(async () => true);
    const verifyScreenCaptureCapability = jest.fn(async () => ({
      granted: true,
      details: {
        capture_backend: 'pyautogui_fallback+macos_appkit_cursor',
      },
    }));

    const status = await requestPermission('screen_capture', {
      platform: 'darwin',
      permissionStateStore,
      shell: {
        openExternal,
      },
      systemPreferences: {
        getMediaAccessStatus: jest.fn(() => 'granted'),
      },
      verifyScreenCaptureCapability,
    });

    expect(openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
    expect(verifyScreenCaptureCapability).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
    expect(status.details.capability_check.details.capture_backend).toBe('pyautogui_fallback+macos_appkit_cursor');
  });

  test('screen capture request on macOS stays needs-action when real screenshot verification fails', async () => {
    const verifyScreenCaptureCapability = jest.fn(async () => ({
      granted: false,
      reason: 'User dismissed the verification screenshot prompt.',
    }));

    const status = await requestPermission('screen_capture', {
      platform: 'darwin',
      permissionStateStore,
      shell: {
        openExternal: jest.fn(async () => true),
      },
      systemPreferences: {
        getMediaAccessStatus: jest.fn(() => 'granted'),
      },
      verifyScreenCaptureCapability,
    });

    expect(verifyScreenCaptureCapability).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(String(status.reason || '')).toContain('verification screenshot prompt');
  });

  test('microphone request invokes askForMediaAccess then re-probes status', async () => {
    const askForMediaAccess = jest.fn(async () => true);
    const getMediaAccessStatus = jest.fn(() => 'granted');
    const focusPermissionPromptWindow = jest.fn(async () => ({ success: true }));

    const status = await requestPermission('microphone', {
      platform: 'darwin',
      permissionStateStore,
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
      permissionStateStore,
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
    const initial = await runPermissionProbe('filesystem_workspace_access', {
      platform: 'linux',
      permissionStateStore,
    });
    expect(initial.status).toBe('needs-action');
    expect(initial.granted).toBe(false);

    const status = await requestPermission('filesystem_workspace_access', {
      platform: 'linux',
      permissionStateStore,
      fs: {
        existsSync: jest.fn(() => true),
      },
      dialog: {
        showOpenDialog: jest.fn(async () => ({
          canceled: false,
          filePaths: ['/tmp/windieos-workspace'],
        })),
      },
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);

    const reprobe = await runPermissionProbe('filesystem_workspace_access', {
      platform: 'linux',
      permissionStateStore,
      fs: {
        existsSync: jest.fn(() => true),
      },
    });
    expect(reprobe.status).toBe('granted');
    expect(reprobe.details.selected_paths).toEqual(['/tmp/windieos-workspace']);
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
      permissionStateStore,
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
      permissionStateStore,
      desktopCapturer: {
        getSources: jest.fn(async () => ([])),
      },
      runCommand,
    });

    expect(grantedStatus.status).toBe('granted');
    expect(grantedStatus.granted).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();

    const deniedStatus = await requestPermission('screen_capture', {
      platform: 'linux',
      permissionStateStore: createMockPermissionStateStore(),
      desktopCapturer: {
        getSources: jest.fn(async () => {
          throw new Error('portal canceled');
        }),
      },
      runCommand,
    });

    expect(deniedStatus.status).toBe('needs-action');
    expect(deniedStatus.granted).toBe(false);
    expect(String(deniedStatus.reason || '')).toContain('portal canceled');
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
      permissionStateStore,
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
      permissionStateStore,
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
      permissionStateStore,
      verifyInputControlCapability: jest.fn(async () => ({ granted: true })),
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('linux microphone can become granted after verifier passes', async () => {
    const status = await requestPermission('microphone', {
      platform: 'linux',
      permissionStateStore,
      verifyMicrophoneCapability: jest.fn(async () => ({ granted: true })),
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('windows screen capture grant verifies capability directly without opening settings', async () => {
    const openExternal = jest.fn(async () => true);
    const getSources = jest.fn(async () => ([{ id: 'screen:1:0', name: 'Display 1' }]));

    const status = await requestPermission('screen_capture', {
      platform: 'win32',
      permissionStateStore,
      desktopCapturer: {
        getSources,
      },
      shell: {
        openExternal,
      },
    });

    expect(getSources).toHaveBeenCalledTimes(1);
    expect(openExternal).not.toHaveBeenCalled();
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('windows screen capture stays needs-action when desktop capture verification fails', async () => {
    const openExternal = jest.fn(async () => true);
    const status = await requestPermission('screen_capture', {
      platform: 'win32',
      permissionStateStore,
      desktopCapturer: {
        getSources: jest.fn(async () => {
          throw new Error('capture denied');
        }),
      },
      shell: {
        openExternal,
      },
    });

    expect(openExternal).not.toHaveBeenCalled();
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(String(status.reason || '')).toContain('capture denied');
  });

  test('browser automation probe reflects frontend enable preference and runtime readiness', async () => {
    const disabled = await runPermissionProbe('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => false,
      verifyBrowserAutomationCapability: jest.fn(async () => ({ granted: true })),
    });
    expect(disabled.status).toBe('needs-action');
    expect(disabled.granted).toBe(false);

    const enabled = await runPermissionProbe('browser_automation', {
      platform: 'linux',
      getBrowserAutomationPreference: () => true,
      verifyBrowserAutomationCapability: jest.fn(async () => ({ granted: true })),
    });
    expect(enabled.status).toBe('granted');
    expect(enabled.granted).toBe(true);
  });

  test('browser automation request returns needs-action when capability check fails', async () => {
    const status = await requestPermission('browser_automation', {
      platform: 'linux',
      permissionStateStore,
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
    const warmBrowserAutomationPermission = jest.fn(async () => ({
      success: true,
      details: { status: 'successful' },
    }));
    const status = await requestPermission('browser_automation', {
      platform: 'linux',
      permissionStateStore,
      getBrowserAutomationPreference: () => true,
      verifyBrowserAutomationCapability: jest.fn(async () => ({
        granted: true,
        details: { browser_feature_pack_available: true },
      })),
      warmBrowserAutomationPermission,
    });

    expect(warmBrowserAutomationPermission).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
    expect(status.details.browser_automation_enabled).toBe(true);
    expect(status.details.browser_warmup.success).toBe(true);
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
    const warmBrowserAutomationPermission = jest.fn(async () => ({
      success: true,
      details: { status: 'successful' },
    }));

    const status = await requestPermission('browser_automation', {
      platform: 'linux',
      permissionStateStore,
      getBrowserAutomationPreference: () => true,
      verifyBrowserAutomationCapability,
      installBrowserAutomationRuntime,
      warmBrowserAutomationPermission,
      dialog: { showMessageBox },
    });

    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(installBrowserAutomationRuntime).toHaveBeenCalledTimes(1);
    expect(verifyBrowserAutomationCapability).toHaveBeenCalledTimes(2);
    expect(warmBrowserAutomationPermission).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('browser automation request stays needs-action when browser warmup fails', async () => {
    const warmBrowserAutomationPermission = jest.fn(async () => ({
      success: false,
      error: 'Failed to connect to Chrome.',
    }));

    const status = await requestPermission('browser_automation', {
      platform: 'darwin',
      permissionStateStore,
      getBrowserAutomationPreference: () => true,
      verifyBrowserAutomationCapability: jest.fn(async () => ({
        granted: true,
        details: { browser_feature_pack_available: true },
      })),
      warmBrowserAutomationPermission,
    });

    expect(warmBrowserAutomationPermission).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(String(status.reason || '')).toContain('Failed to connect to Chrome');
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
      permissionStateStore,
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

  test('unknown permission id returns error status', async () => {
    const status = await runPermissionProbe('unknown_permission', {
      platform: 'linux',
      permissionStateStore,
    });
    expect(status.status).toBe('error');
    expect(status.granted).toBe(false);
  });
});
