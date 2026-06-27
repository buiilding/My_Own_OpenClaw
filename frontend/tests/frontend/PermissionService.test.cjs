/** @jest-environment node */

const {
  listPermissionsWithStatus,
  requestPermission,
  runPermissionProbe,
} = require('../../src/main/permissions/permission_service.cjs');

const samplePermissionCopy = Object.freeze({
  workspace: Object.freeze({
    folderPickerTitle: 'Select sample workspace folder',
  }),
});

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
    expect(result.permissions.some((permission) => permission.permission_id === 'system_events_automation')).toBe(false);
    expect(result.permissions.find((permission) => permission.permission_id === 'screen_capture')).toMatchObject({
      show_in_onboarding: false,
      onboarding_required_now: false,
      onboarding_visibility: 'settings',
    });
    expect(result.permissions.find((permission) => permission.permission_id === 'input_control_accessibility')).toMatchObject({
      show_in_onboarding: false,
      onboarding_required_now: false,
      onboarding_visibility: 'settings',
    });
    expect(result.permissions.find((permission) => permission.permission_id === 'filesystem_workspace_access')).toMatchObject({
      show_in_onboarding: true,
      onboarding_required_now: true,
      onboarding_visibility: 'required',
    });
    expect(result.permissions.find((permission) => permission.permission_id === 'browser_automation')).toMatchObject({
      show_in_onboarding: true,
      onboarding_required_now: false,
      onboarding_visibility: 'optional',
    });
  });

  test('returns macOS-only System Events automation permission on darwin', async () => {
    const result = await listPermissionsWithStatus({
      platform: 'darwin',
      permissionStateStore,
      verifyBrowserAutomationCapability: jest.fn(async () => ({ granted: false })),
      probeMacOsSystemEventsAutomationPermission: jest.fn(async () => ({ granted: false })),
    });

    expect(result.permissions.some((permission) => permission.permission_id === 'system_events_automation')).toBe(true);
    expect(result.permissions.find((permission) => permission.permission_id === 'screen_capture')).toMatchObject({
      show_in_onboarding: true,
      onboarding_required_now: true,
      onboarding_visibility: 'required',
    });
    expect(result.permissions.find((permission) => permission.permission_id === 'shell_execution')).toMatchObject({
      show_in_onboarding: false,
      onboarding_required_now: false,
      onboarding_visibility: 'settings',
    });
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
    const focusPermissionPromptWindow = jest.fn(async () => ({ success: true }));
    const verifyScreenCaptureCapability = jest.fn(async () => ({
      granted: true,
      details: {
        capture_engine: 'pyautogui_fallback+macos_builtin_cursor',
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
      focusPermissionPromptWindow,
      verifyScreenCaptureCapability,
    });

    expect(openExternal).not.toHaveBeenCalled();
    expect(focusPermissionPromptWindow).toHaveBeenCalledTimes(1);
    expect(verifyScreenCaptureCapability).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
    expect(status.details.capability_check.details.capture_engine).toBe('pyautogui_fallback+macos_builtin_cursor');
  });

  test('screen capture request on macOS triggers only the native capture prompt before verification when access is missing', async () => {
    const openExternal = jest.fn(async () => true);
    const getSources = jest.fn(async () => []);
    const focusPermissionPromptWindow = jest.fn(async () => ({ success: true }));
    const verifyScreenCaptureCapability = jest.fn(async () => ({
      granted: true,
    }));

    const status = await requestPermission('screen_capture', {
      platform: 'darwin',
      permissionStateStore,
      shell: {
        openExternal,
      },
      desktopCapturer: {
        getSources,
      },
      systemPreferences: {
        getMediaAccessStatus: jest.fn(() => 'denied'),
      },
      focusPermissionPromptWindow,
      verifyScreenCaptureCapability,
    });

    expect(getSources).toHaveBeenCalledTimes(1);
    expect(openExternal).not.toHaveBeenCalled();
    expect(focusPermissionPromptWindow).not.toHaveBeenCalled();
    expect(verifyScreenCaptureCapability).not.toHaveBeenCalled();
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(String(status.reason || '')).toContain('Waiting for Screen Recording access');
  });

  test('screen capture request on macOS stays needs-action when real screenshot verification fails', async () => {
    const openExternal = jest.fn(async () => true);
    const focusPermissionPromptWindow = jest.fn(async () => ({ success: true }));
    const verifyScreenCaptureCapability = jest.fn(async () => ({
      granted: false,
      reason: 'User dismissed the verification screenshot prompt.',
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
      focusPermissionPromptWindow,
      verifyScreenCaptureCapability,
    });

    expect(openExternal).not.toHaveBeenCalled();
    expect(focusPermissionPromptWindow).toHaveBeenCalledTimes(1);
    expect(verifyScreenCaptureCapability).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(String(status.reason || '')).toContain('verification screenshot prompt');
  });

  test('accessibility request on macOS uses the native prompt path without auto-opening System Settings', async () => {
    const openExternal = jest.fn(async () => true);
    const isTrustedAccessibilityClient = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const status = await requestPermission('input_control_accessibility', {
      platform: 'darwin',
      permissionStateStore,
      shell: {
        openExternal,
      },
      systemPreferences: {
        isTrustedAccessibilityClient,
      },
    });

    expect(isTrustedAccessibilityClient).toHaveBeenNthCalledWith(1, true);
    expect(isTrustedAccessibilityClient).toHaveBeenNthCalledWith(2, false);
    expect(openExternal).not.toHaveBeenCalled();
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
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

  test('microphone request on macOS does not auto-open System Settings when access is denied', async () => {
    const askForMediaAccess = jest.fn(async () => false);
    const requestRendererMicrophoneAccess = jest.fn(async () => ({ success: false }));
    const focusPermissionPromptWindow = jest.fn(async () => ({ success: true }));
    const openExternal = jest.fn(async () => true);
    const getMediaAccessStatus = jest.fn(() => 'denied');

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
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
  });

  test('System Events automation probe on macOS reflects the local-runtime automation verifier', async () => {
    const probeMacOsSystemEventsAutomationPermission = jest.fn(async () => ({
      granted: false,
      reason: 'Sample app still needs permission to control System Events.',
      details: {
        os_status: -1744,
      },
    }));

    const status = await runPermissionProbe('system_events_automation', {
      platform: 'darwin',
      probeMacOsSystemEventsAutomationPermission,
    });

    expect(probeMacOsSystemEventsAutomationPermission).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(status.details.verification.os_status).toBe(-1744);
  });

  test('System Events automation request on macOS is granted after the explicit prompt path succeeds', async () => {
    const requestMacOsSystemEventsAutomationPermission = jest.fn(async () => ({
      granted: true,
      reason: 'System Events automation permission is granted.',
      details: {
        os_status: 0,
      },
    }));

    const status = await requestPermission('system_events_automation', {
      platform: 'darwin',
      permissionStateStore,
      requestMacOsSystemEventsAutomationPermission,
    });

    expect(requestMacOsSystemEventsAutomationPermission).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
    expect(status.details.verification.os_status).toBe(0);
  });

  test('filesystem access starts as needs-action and becomes granted after folder picker selection', async () => {
    const showOpenDialog = jest.fn(async () => ({
      canceled: false,
      filePaths: ['/tmp/project-alpha-workspace'],
    }));
    const initial = await runPermissionProbe('filesystem_workspace_access', {
      platform: 'linux',
      permissionStateStore,
    });
    expect(initial.status).toBe('needs-action');
    expect(initial.granted).toBe(false);

    const status = await requestPermission('filesystem_workspace_access', {
      platform: 'linux',
      permissionCopy: samplePermissionCopy,
      permissionStateStore,
      fs: {
        existsSync: jest.fn(() => true),
      },
      dialog: {
        showOpenDialog,
      },
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: 'Select sample workspace folder',
      buttonLabel: 'Give folder context',
      properties: ['openDirectory', 'createDirectory'],
    });

    const reprobe = await runPermissionProbe('filesystem_workspace_access', {
      platform: 'linux',
      permissionStateStore,
      fs: {
        existsSync: jest.fn(() => true),
      },
    });
    expect(reprobe.status).toBe('granted');
    expect(reprobe.details.selected_paths).toEqual(['/tmp/project-alpha-workspace']);
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
    expect(permissionStateStore.set).toHaveBeenCalledWith(
      'shell_execution',
      expect.objectContaining({
        granted: true,
        source: 'shell_execution_auth_flow',
      }),
    );

    const reprobe = await runPermissionProbe('shell_execution', {
      platform: 'linux',
      permissionStateStore,
      verifyShellExecutionCapability: jest.fn(async () => ({
        granted: true,
        reason: 'Shell execution runtime is available.',
      })),
    });
    expect(reprobe.status).toBe('granted');
    expect(reprobe.granted).toBe(true);
  });

  test('shell execution runtime availability alone does not grant authorization', async () => {
    const status = await runPermissionProbe('shell_execution', {
      platform: 'linux',
      permissionStateStore,
      verifyShellExecutionCapability: jest.fn(async () => ({
        granted: true,
        reason: 'Shell execution runtime is available.',
      })),
    });

    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
    expect(status.reason).toBe('Shell execution requires explicit authorization.');
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

  test('browser automation request opens the browser on first grant even before the frontend toggle is saved', async () => {
    const warmBrowserAutomationPermission = jest.fn(async () => ({
      success: true,
      details: { status: 'successful' },
    }));
    const status = await requestPermission('browser_automation', {
      platform: 'darwin',
      permissionStateStore,
      getBrowserAutomationPreference: () => false,
      verifyBrowserAutomationCapability: jest.fn(async () => ({
        granted: true,
        details: { browser_binary_available: true },
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

  test('browser automation on macOS opens the browser directly without a separate App Management gate', async () => {
    const warmBrowserAutomationPermission = jest.fn(async () => ({
      success: true,
      details: { browser_connected: true },
    }));

    const status = await requestPermission('browser_automation', {
      platform: 'darwin',
      permissionStateStore,
      getBrowserAutomationPreference: () => false,
      verifyBrowserAutomationCapability: jest.fn(async () => ({ granted: true })),
      warmBrowserAutomationPermission,
    });

    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
    expect(warmBrowserAutomationPermission).toHaveBeenCalledTimes(1);
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
