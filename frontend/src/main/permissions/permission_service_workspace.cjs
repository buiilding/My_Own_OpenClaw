/**
 * Implements the permission service workspace service for the Electron main process.
 */

const {
  PERMISSION_STATUS,
  buildProbeResult,
  fs,
  getStoredPermissionEntry,
  isAuthPromptCanceled,
  runCommand,
  runFirstSuccessfulCommand,
  setStoredPermissionEntry,
} = require('./permission_service_runtime.cjs');

function getWorkspaceCopy(deps = {}) {
  const copy = deps.mainHostSkin?.permissions?.workspace || {};
  return {
    folderPickerTitle: copy.folderPickerTitle || 'Select workspace folder',
  };
}

async function verifyWorkspaceAccessCapability(permissionId, deps = {}) {
  const storedEntry = await getStoredPermissionEntry(permissionId, deps);
  const selectedPaths = Array.isArray(storedEntry?.selected_paths) ? storedEntry.selected_paths : [];
  const fsModule = deps.fs || fs;

  if (selectedPaths.length === 0) {
    return {
      granted: false,
      reason: 'No workspace folder has been selected yet.',
      details: {
        selected_paths: [],
      },
    };
  }

  const existingPaths = selectedPaths.filter((selectedPath) => {
    try {
      return fsModule.existsSync(selectedPath);
    } catch (_error) {
      return false;
    }
  });

  if (existingPaths.length === 0) {
    return {
      granted: false,
      reason: 'The previously selected workspace folder is no longer available.',
      details: {
        selected_paths: selectedPaths,
      },
    };
  }

  return {
    granted: true,
    reason: 'Workspace access is configured.',
    details: {
      selected_paths: existingPaths,
      stored_entry: storedEntry,
    },
  };
}

async function verifyShellExecutionCapability(deps = {}) {
  if (typeof deps.verifyShellExecutionCapability === 'function') {
    const result = await deps.verifyShellExecutionCapability(deps);
    return result && typeof result === 'object'
      ? {
        granted: result.granted === true,
        reason: typeof result.reason === 'string' ? result.reason : '',
        details: result.details || result,
      }
      : { granted: result === true, reason: '', details: {} };
  }

  const platform = deps.platform || process.platform;
  if (platform === 'win32') {
    const result = await runCommand('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$PSVersionTable.PSVersion.Major',
    ], deps);
    return {
      granted: result?.success === true,
      reason: result?.success === true ? 'PowerShell runtime is available.' : 'PowerShell runtime is unavailable.',
      details: { platform, command_result: result },
    };
  }

  if (platform === 'darwin') {
    const result = await runCommand('sh', ['-lc', 'command -v osascript >/dev/null 2>&1'], deps);
    return {
      granted: result?.success === true,
      reason: result?.success === true ? 'Shell execution runtime is available.' : 'osascript runtime is unavailable.',
      details: { platform, command_result: result },
    };
  }

  const result = await runFirstSuccessfulCommand([
    { command: 'bash', args: ['-lc', 'command -v bash >/dev/null 2>&1'] },
    { command: 'sh', args: ['-lc', 'command -v sh >/dev/null 2>&1'] },
  ], deps);
  return {
    granted: result?.success === true,
    reason: result?.success === true ? 'Shell execution runtime is available.' : 'No supported shell runtime was found.',
    details: { platform, command_result: result },
  };
}

async function probeFilesystemWorkspaceAccess(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const capability = await verifyWorkspaceAccessCapability(permissionId, deps);

  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Workspace access is configured.', {
      platform,
      ...capability.details,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason || 'Select a workspace folder to continue.', {
    platform,
    ...capability.details,
  });
}

async function probeShellExecution(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const storedEntry = await getStoredPermissionEntry(permissionId, deps);
  const capability = await verifyShellExecutionCapability(deps);

  if (storedEntry?.granted !== true) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Shell execution requires explicit authorization.', {
      platform,
      stored_entry: storedEntry,
      verification: capability.details,
    });
  }

  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, capability.reason || 'Shell execution runtime is available.', {
      platform,
      stored_entry: storedEntry,
      verification: capability.details,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason || 'Shell execution runtime is unavailable.', {
    platform,
    stored_entry: storedEntry,
    verification: capability.details,
  });
}

async function requestFilesystemWorkspaceAccessPermission(permission, deps = {}, services = {}) {
  const permissionId = permission.permission_id;
  const dialog = deps.dialog;
  const platform = deps.platform || process.platform;
  const copy = getWorkspaceCopy(deps);
  const rerunProbe = typeof services.rerunProbe === 'function'
    ? services.rerunProbe
    : async () => probeFilesystemWorkspaceAccess(permission, deps);

  if (!dialog || typeof dialog.showOpenDialog !== 'function') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Workspace access prompt is unavailable in this runtime.', {
      platform,
    });
  }

  try {
    const result = await dialog.showOpenDialog({
      title: copy.folderPickerTitle,
      buttonLabel: 'Give folder context',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (!result || result.canceled === true || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Workspace access was not granted. Select a folder to continue.', {
        platform,
      });
    }

    await setStoredPermissionEntry(permissionId, {
      granted: true,
      source: 'workspace_picker',
      selected_paths: result.filePaths,
      details: {
        selected_paths: result.filePaths,
      },
    }, deps);
    return await rerunProbe(permissionId, deps);
  } catch (error) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, error?.message || 'Failed to open workspace access prompt.', {
      platform,
    });
  }
}

async function requestShellExecutionPermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  let result = { success: false, reason: 'No shell permission flow available.' };

  if (platform === 'darwin') {
    result = await runCommand('osascript', ['-e', 'do shell script "true" with administrator privileges'], deps);
  } else if (platform === 'win32') {
    result = await runCommand('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Start-Process -FilePath "cmd.exe" -ArgumentList "/c exit 0" -Verb RunAs -WindowStyle Hidden -Wait',
    ], deps);
  } else if (platform === 'linux') {
    result = await runFirstSuccessfulCommand([
      { command: 'pkexec', args: ['/usr/bin/true'] },
      { command: 'pkexec', args: ['true'] },
    ], deps);
  }

  const errorText = result?.stderr || result?.error || result?.reason || '';
  if (result?.success === true) {
    const storedEntry = await setStoredPermissionEntry(permissionId, {
      granted: true,
      source: 'shell_execution_auth_flow',
      details: {
        platform,
        command_result: result,
      },
    }, deps);
    if (!storedEntry) {
      return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Shell execution authorization could not be persisted.', {
        platform,
        command_result: result,
      });
    }

    return await probeShellExecution(permission, deps);
  }

  await setStoredPermissionEntry(permissionId, {
    granted: false,
    source: 'shell_execution_auth_flow',
    details: {
      platform,
      command_result: result,
    },
  }, deps);

  return buildProbeResult(
    permissionId,
    PERMISSION_STATUS.NEEDS_ACTION,
    isAuthPromptCanceled(errorText)
      ? 'OS authentication prompt was canceled or denied.'
      : 'Failed to complete shell-execution authentication flow.',
    {
      platform,
      command_result: result,
    },
  );
}

module.exports = {
  probeFilesystemWorkspaceAccess,
  probeShellExecution,
  requestFilesystemWorkspaceAccessPermission,
  requestShellExecutionPermission,
};
