/**
 * Coordinates the permission ipc runtime for the Electron main process.
 */

const {
  verifyScreenCaptureCapability: verifyRealScreenCaptureCapability,
} = require('../sidecar/local_runtime_bridge.cjs');
const { createPermissionStateStore } = require('./permission_state_store.cjs');
const {
  checkPermissions,
  listPermissionsWithStatus,
  requestPermission,
  runPermissionProbe,
} = require('./permission_service.cjs');

function initializePermissionHandlersRuntime(deps = {}) {
  const {
    ipcMain,
    shell,
    systemPreferences,
    platform,
    dialog,
    desktopCapturer,
    mainHostSkin,
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
    emitAppDiagnosticEvent,
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
    mainHostSkin,
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
  const normalizeTraceString = (value) => (
    typeof value === 'string' && value.trim()
      ? value.trim()
      : null
  );
  const getTraceContext = (options = {}) => {
    const nestedTrace = options && typeof options._trace === 'object' && !Array.isArray(options._trace)
      ? options._trace
      : {};
    return {
      conversationRef: normalizeTraceString(
        options?.conversationRef
          || nestedTrace.conversationRef,
      ),
      turnRef: normalizeTraceString(
        options?.turnRef
          || nestedTrace.turnRef,
      ),
    };
  };
  const hasConversationTraceContext = (traceContext = {}) => (
    Boolean(traceContext.conversationRef && traceContext.turnRef)
  );

  const recordPermissionTrace = async ({
    stage,
    status,
    permissionId,
    permissionStatus = null,
    startedAt = null,
    error = null,
    data = {},
    traceContext = {},
  }) => {
    const shouldRecordConversationTrace = (
      hasConversationTraceContext(traceContext)
      && typeof emitTraceEvent === 'function'
    );
    const shouldRecordAppDiagnostic = (
      !shouldRecordConversationTrace
      && typeof emitAppDiagnosticEvent === 'function'
    );
    if (!shouldRecordConversationTrace && !shouldRecordAppDiagnostic) {
      return;
    }
    const endedAt = new Date().toISOString();
    const durationMs = startedAt ? Date.now() - Date.parse(startedAt) : null;
    const event = {
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
    };
    try {
      if (shouldRecordConversationTrace) {
        await emitTraceEvent({
          ...event,
          conversationRef: traceContext.conversationRef,
          turnRef: traceContext.turnRef,
        });
        return;
      }
      await emitAppDiagnosticEvent(event);
    } catch (traceError) {
      if (typeof log === 'function') {
        log(`Failed to record permission diagnostic: ${traceError?.message || traceError}`);
      }
    }
  };

  const buildPermissionProbeResult = async (permissionId, stage = 'probe', traceContext = {}) => {
    const startedAt = new Date().toISOString();
    await recordPermissionTrace({
      stage,
      status: 'started',
      permissionId,
      startedAt,
      traceContext,
    });
    try {
      const status = await runPermissionProbe(permissionId, permissionDeps);
      await recordPermissionTrace({
        stage,
        status: 'succeeded',
        permissionId,
        permissionStatus: status,
        startedAt,
        traceContext,
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
        traceContext,
      });
      throw error;
    }
  };

  const buildBulkPermissionProbeResult = async (permissionIds, traceContext = {}) => {
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
      traceContext,
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
        traceContext,
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
        traceContext,
      });
      throw error;
    }
  };

  const buildPermissionRequestResult = async (permissionId, traceContext = {}) => {
    const startedAt = new Date().toISOString();
    await recordPermissionTrace({
      stage: 'request',
      status: 'started',
      permissionId,
      startedAt,
      traceContext,
    });
    try {
      const status = await requestPermission(permissionId, permissionDeps);
      await recordPermissionTrace({
        stage: 'request',
        status: 'succeeded',
        permissionId,
        permissionStatus: status,
        startedAt,
        traceContext,
      });
      return status;
    } catch (error) {
      await recordPermissionTrace({
        stage: 'request',
        status: 'failed',
        permissionId,
        startedAt,
        error,
        traceContext,
      });
      throw error;
    }
  };

  const buildWorkspaceActivationTraceData = (workspacePath) => ({
    hasWorkspacePath: typeof workspacePath === 'string' && Boolean(workspacePath.trim()),
  });

  const buildWorkspaceActivationResult = async (workspacePath, runActivation, traceContext = {}) => {
    const startedAt = new Date().toISOString();
    await recordPermissionTrace({
      stage: 'workspace_activate',
      status: 'started',
      permissionId: 'filesystem_workspace_access',
      startedAt,
      data: buildWorkspaceActivationTraceData(workspacePath),
      traceContext,
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
        traceContext,
      });
      return result;
    } catch (error) {
      await recordPermissionTrace({
        stage: 'workspace_activate',
        status: 'failed',
        permissionId: 'filesystem_workspace_access',
        startedAt,
        error,
        traceContext,
      });
      throw error;
    }
  };

  ipcMain.handle('list-permissions', async () => {
    return {
      success: true,
      data: await listPermissionsWithStatus(permissionDeps),
    };
  });

  ipcMain.handle('check-permissions', async (_event, options = {}) => {
    const permissionIds = Array.isArray(options?.permissionIds) ? options.permissionIds : null;
    return await buildBulkPermissionProbeResult(permissionIds, getTraceContext(options));
  });

  ipcMain.handle('check-permission', async (_event, options = {}) => {
    return await buildPermissionProbeResult(getPermissionId(options), 'probe', getTraceContext(options));
  });

  ipcMain.handle('run-permission-probe', async (_event, options = {}) => {
    return await buildPermissionProbeResult(getPermissionId(options), 'probe', getTraceContext(options));
  });

  ipcMain.handle('request-permission', async (_event, options = {}) => {
    const permissionId = getPermissionId(options);
    const status = await buildPermissionRequestResult(permissionId, getTraceContext(options));
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
    }, getTraceContext(options));
  });
}

module.exports = {
  initializePermissionHandlersRuntime,
};
