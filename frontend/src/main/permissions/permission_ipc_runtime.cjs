const os = require('os');
const { handleSetAgentSudoAccess } = require('./agent_sudo_access_handler.cjs');
const {
  verifyScreenCaptureCapability: verifyRealScreenCaptureCapability,
} = require('../sidecar/local_backend_bridge.cjs');
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
    emitTraceEvent,
    log,
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

  const recordPermissionTrace = async ({
    stage,
    status,
    permissionId,
    permissionStatus = null,
    startedAt = null,
    error = null,
    data = {},
  }) => {
    if (typeof emitTraceEvent !== 'function') {
      return;
    }
    const endedAt = new Date().toISOString();
    const durationMs = startedAt ? Date.now() - Date.parse(startedAt) : null;
    try {
      await emitTraceEvent({
        path: 'permission.probe',
        stage,
        status,
        runtime: 'electron-main',
        startedAt,
        endedAt,
        durationMs,
        data: {
          permissionId: permissionId || null,
          permissionStatus: typeof permissionStatus?.status === 'string'
            ? permissionStatus.status
            : null,
          granted: permissionStatus?.granted === true,
          hasDetails: Boolean(permissionStatus?.details),
          platform: typeof platform === 'string' ? platform : process.platform,
          ...data,
        },
        error,
      });
    } catch (traceError) {
      if (typeof log === 'function') {
        log(`Failed to record permission trace: ${traceError?.message || traceError}`);
      }
    }
  };

  const buildPermissionProbeResult = async (permissionId, stage = 'probe') => {
    const startedAt = new Date().toISOString();
    await recordPermissionTrace({
      stage,
      status: 'started',
      permissionId,
      startedAt,
    });
    try {
      const status = await runPermissionProbe(permissionId, permissionDeps);
      await recordPermissionTrace({
        stage,
        status: 'succeeded',
        permissionId,
        permissionStatus: status,
        startedAt,
      });
      return {
        success: true,
        data: {
          status,
        },
      };
    } catch (error) {
      await recordPermissionTrace({
        stage,
        status: 'failed',
        permissionId,
        startedAt,
        error,
      });
      throw error;
    }
  };

  const buildBulkPermissionProbeResult = async (permissionIds) => {
    const startedAt = new Date().toISOString();
    const requestedCount = Array.isArray(permissionIds) ? permissionIds.length : 0;
    await recordPermissionTrace({
      stage: 'bulk_probe',
      status: 'started',
      permissionId: null,
      startedAt,
      data: {
        requestedCount,
      },
    });
    try {
      const statuses = await checkPermissions(permissionIds, permissionDeps);
      await recordPermissionTrace({
        stage: 'bulk_probe',
        status: 'succeeded',
        permissionId: null,
        startedAt,
        data: {
          requestedCount,
          statusCount: Array.isArray(statuses) ? statuses.length : 0,
          grantedCount: Array.isArray(statuses)
            ? statuses.filter((entry) => entry?.granted === true).length
            : 0,
        },
      });
      return {
        success: true,
        data: {
          statuses,
        },
      };
    } catch (error) {
      await recordPermissionTrace({
        stage: 'bulk_probe',
        status: 'failed',
        permissionId: null,
        startedAt,
        data: {
          requestedCount,
        },
        error,
      });
      throw error;
    }
  };

  const buildPermissionRequestResult = async (permissionId) => {
    const startedAt = new Date().toISOString();
    await recordPermissionTrace({
      stage: 'request',
      status: 'started',
      permissionId,
      startedAt,
    });
    try {
      const status = await requestPermission(permissionId, permissionDeps);
      await recordPermissionTrace({
        stage: 'request',
        status: 'succeeded',
        permissionId,
        permissionStatus: status,
        startedAt,
      });
      return status;
    } catch (error) {
      await recordPermissionTrace({
        stage: 'request',
        status: 'failed',
        permissionId,
        startedAt,
        error,
      });
      throw error;
    }
  };

  const buildWorkspaceActivationTraceData = (workspacePath) => ({
    hasWorkspacePath: typeof workspacePath === 'string' && Boolean(workspacePath.trim()),
  });

  const buildWorkspaceActivationResult = async (workspacePath, runActivation) => {
    const startedAt = new Date().toISOString();
    await recordPermissionTrace({
      stage: 'workspace_activate',
      status: 'started',
      permissionId: 'filesystem_workspace_access',
      startedAt,
      data: buildWorkspaceActivationTraceData(workspacePath),
    });
    try {
      const result = await runActivation();
      await recordPermissionTrace({
        stage: 'workspace_activate',
        status: result?.success === false ? 'failed' : 'succeeded',
        permissionId: 'filesystem_workspace_access',
        permissionStatus: result?.data?.status,
        startedAt,
        data: buildWorkspaceActivationTraceData(workspacePath),
        error: result?.success === false
          ? { code: 'WorkspaceAccessDenied', message: result.error || 'Workspace activation failed.' }
          : null,
      });
      return result;
    } catch (error) {
      await recordPermissionTrace({
        stage: 'workspace_activate',
        status: 'failed',
        permissionId: 'filesystem_workspace_access',
        startedAt,
        error,
      });
      throw error;
    }
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
    return await buildBulkPermissionProbeResult(permissionIds);
  });

  ipcMain.handle('check-permission', async (_event, options = {}) => {
    return await buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('run-permission-probe', async (_event, options = {}) => {
    return await buildPermissionProbeResult(getPermissionId(options));
  });

  ipcMain.handle('request-permission', async (_event, options = {}) => {
    const permissionId = getPermissionId(options);
    const status = await buildPermissionRequestResult(permissionId);
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

  ipcMain.handle('set-active-workspace', async (_event, options = {}) => {
    const rawWorkspacePath = typeof options?.workspacePath === 'string'
      ? options.workspacePath.trim()
      : '';

    return await buildWorkspaceActivationResult(rawWorkspacePath, async () => {
      if (rawWorkspacePath) {
        const storedEntry = await resolvedPermissionStateStore.get('filesystem_workspace_access');
        const selectedPaths = Array.isArray(storedEntry?.selected_paths)
          ? storedEntry.selected_paths.filter((selectedPath) => (
            typeof selectedPath === 'string' && selectedPath.trim()
          ))
          : [];
        const hasExistingGrant = selectedPaths.includes(rawWorkspacePath);
        if (!hasExistingGrant) {
          const status = await runPermissionProbe('filesystem_workspace_access', permissionDeps);
          if (typeof emitWorkspaceAccessUpdated === 'function') {
            emitWorkspaceAccessUpdated(status);
          }
          return {
            success: false,
            error: 'Workspace path must be selected through the workspace permission prompt before it can become active.',
            data: {
              status,
            },
          };
        }
        await resolvedPermissionStateStore.set('filesystem_workspace_access', {
          granted: true,
          source: storedEntry?.source || 'workspace_picker',
          selected_paths: [rawWorkspacePath],
          details: {
            ...(storedEntry?.details && typeof storedEntry.details === 'object'
              ? storedEntry.details
              : {}),
            selected_paths: [rawWorkspacePath],
          },
        });
      } else {
        await resolvedPermissionStateStore.delete('filesystem_workspace_access');
      }

      const status = await runPermissionProbe('filesystem_workspace_access', permissionDeps);
      if (typeof emitWorkspaceAccessUpdated === 'function') {
        emitWorkspaceAccessUpdated(status);
      }

      return {
        success: true,
        data: {
          status,
        },
      };
    });
  });
}

module.exports = {
  initializePermissionHandlersRuntime,
};
