const os = require('os');
const { handleSetAgentSudoAccess } = require('./agent_sudo_access_handler.cjs');
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
    getBrowserAutomationPreference,
    verifyBrowserAutomationCapability,
    installBrowserAutomationRuntime,
  } = deps;

  const permissionDeps = {
    platform,
    shell,
    systemPreferences,
    dialog,
    desktopCapturer,
    runCommand,
    requestRendererMicrophoneAccess,
    focusPermissionPromptWindow,
    getBrowserAutomationPreference,
    verifyBrowserAutomationCapability,
    installBrowserAutomationRuntime,
  };
  const getPermissionId = (options = {}) => {
    return typeof options?.permissionId === 'string'
      ? options.permissionId
      : '';
  };
  const buildPermissionProbeResult = (permissionId) => {
    return {
      success: true,
      data: {
        status: runPermissionProbe(permissionId, permissionDeps),
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
      data: listPermissionsWithStatus(permissionDeps),
    };
  });

  ipcMain.handle('check-permissions', async (_event, options = {}) => {
    const permissionIds = Array.isArray(options?.permissionIds) ? options.permissionIds : null;
    return {
      success: true,
      data: {
        statuses: checkPermissions(permissionIds, permissionDeps),
      },
    };
  });

  ipcMain.handle('check-permission', async (_event, options = {}) => {
    return buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('run-permission-probe', async (_event, options = {}) => {
    return buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('request-permission', async (_event, options = {}) => {
    const permissionId = getPermissionId(options);
    return {
      success: true,
      data: {
        status: await requestPermission(permissionId, permissionDeps),
      },
    };
  });
}

module.exports = {
  initializePermissionHandlersRuntime,
};
