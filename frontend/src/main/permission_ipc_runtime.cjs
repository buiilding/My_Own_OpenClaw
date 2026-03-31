const os = require('os');
const { handleSetAgentSudoAccess } = require('./agent_sudo_access_handler.cjs');
const {
  verifyScreenCaptureCapability: verifyRealScreenCaptureCapability,
} = require('./local_backend_bridge.cjs');
const { createPermissionStateStore } = require('./permission_state_store.cjs');
const {
  checkPermissions,
  listPermissionsWithStatus,
  requestPermission,
  runPermissionProbe,
} = require('./permission_service.cjs');

function resolveUsername() {
  try {
    return os.userInfo()?.username;
  } catch (_error) {
    return '';
  }
}

function initializePermissionHandlersRuntime(deps = {}) {
  const {
    ipcMain,
    shell,
    systemPreferences,
    platform,
    dialog,
    desktopCapturer,
    runCommand,
    requestRendererMicrophoneAccess,
    focusPermissionPromptWindow,
    verifyScreenCaptureCapability,
    getBrowserAutomationPreference,
    verifyBrowserAutomationCapability,
    installBrowserAutomationRuntime,
    warmBrowserAutomationPermission,
    probeMacOsSystemEventsAutomationPermission,
    requestMacOsSystemEventsAutomationPermission,
    permissionStateStore,
    userDataPath,
    emitWorkspaceAccessUpdated,
  } = deps;

  const resolvedPermissionStateStore = permissionStateStore || createPermissionStateStore({
    userDataPath,
  });

  const permissionDeps = {
    platform,
    shell,
    systemPreferences,
    dialog,
    desktopCapturer,
    runCommand,
    requestRendererMicrophoneAccess,
    focusPermissionPromptWindow,
    verifyScreenCaptureCapability: (
      typeof verifyScreenCaptureCapability === 'function'
        ? verifyScreenCaptureCapability
        : verifyRealScreenCaptureCapability
    ),
    getBrowserAutomationPreference,
    verifyBrowserAutomationCapability,
    installBrowserAutomationRuntime,
    warmBrowserAutomationPermission,
    probeMacOsSystemEventsAutomationPermission,
    requestMacOsSystemEventsAutomationPermission,
    permissionStateStore: resolvedPermissionStateStore,
  };
  const getPermissionId = (options = {}) => {
    return typeof options?.permissionId === 'string'
      ? options.permissionId
      : '';
  };
  const buildPermissionProbeResult = async (permissionId) => {
    return {
      success: true,
      data: {
        status: await runPermissionProbe(permissionId, permissionDeps),
      },
    };
  };

  ipcMain.handle('set-agent-sudo-access', async (_event, options = {}) => {
    return await handleSetAgentSudoAccess(options, {
      platform,
      username: resolveUsername(),
    });
  });

  ipcMain.handle('list-permissions', async () => {
    return {
      success: true,
      data: await listPermissionsWithStatus(permissionDeps),
    };
  });

  ipcMain.handle('check-permissions', async (_event, options = {}) => {
    const permissionIds = Array.isArray(options?.permissionIds) ? options.permissionIds : null;
    return {
      success: true,
      data: {
        statuses: await checkPermissions(permissionIds, permissionDeps),
      },
    };
  });

  ipcMain.handle('check-permission', async (_event, options = {}) => {
    return await buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('run-permission-probe', async (_event, options = {}) => {
    return await buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('request-permission', async (_event, options = {}) => {
    const permissionId = getPermissionId(options);
    const status = await requestPermission(permissionId, permissionDeps);
    if (
      permissionId === 'filesystem_workspace_access'
      && status?.granted === true
      && typeof emitWorkspaceAccessUpdated === 'function'
    ) {
      emitWorkspaceAccessUpdated(status);
    }
    return {
      success: true,
      data: {
        status,
      },
    };
  });
}

module.exports = {
  initializePermissionHandlersRuntime,
};
