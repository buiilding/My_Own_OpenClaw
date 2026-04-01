const {
  PERMISSION_MANIFEST,
  PERMISSION_STATUS,
  PERMISSION_DEFINITION_BY_ID,
  buildProbeResult,
  listPermissionDefinitions,
  permissionAppliesToPlatform,
} = require('./permission_service_runtime.cjs');
const {
  probeScreenCapture,
  requestScreenCapturePermission,
} = require('./permission_service_screen_capture.cjs');
const {
  probeInputControl,
  requestInputControlPermission,
} = require('./permission_service_input_control.cjs');
const {
  probeMicrophone,
  requestMicrophonePermission,
} = require('./permission_service_microphone.cjs');
const {
  probeSystemEventsAutomation,
  probeAppManagement,
  requestSystemEventsAutomationPermission,
  requestAppManagementPermission,
  verifyAppManagementCapability,
} = require('./permission_service_automation.cjs');
const {
  probeFilesystemWorkspaceAccess,
  probeShellExecution,
  requestFilesystemWorkspaceAccessPermission,
  requestShellExecutionPermission,
} = require('./permission_service_workspace.cjs');
const {
  probeBrowserAutomation,
  requestBrowserAutomationPermission,
} = require('./permission_service_browser.cjs');

function doesPermissionApply(permission, deps = {}) {
  return permissionAppliesToPlatform(permission, deps.platform || process.platform);
}

const PROBE_HANDLERS = Object.freeze({
  screen_capture: probeScreenCapture,
  input_control_accessibility: probeInputControl,
  system_events_automation: probeSystemEventsAutomation,
  microphone: probeMicrophone,
  app_management: probeAppManagement,
  filesystem_workspace_access: probeFilesystemWorkspaceAccess,
  shell_execution: probeShellExecution,
  browser_automation: (permission, deps) => probeBrowserAutomation(permission, deps, {
    verifyAppManagementCapability,
  }),
});

async function runPermissionProbe(permissionId, deps = {}) {
  const permission = PERMISSION_DEFINITION_BY_ID.get(permissionId);
  if (!permission) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, 'Unknown permission id.', {
      unknown_permission_id: permissionId,
    });
  }

  if (!doesPermissionApply(permission, deps)) {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.UNSUPPORTED, 'This permission does not apply on the current platform.', {
      platform: deps.platform || process.platform,
      os_scope: permission.os_scope,
    });
  }

  const probeHandler = PROBE_HANDLERS[permission.permission_id];
  if (typeof probeHandler !== 'function') {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.UNSUPPORTED, 'No probe implementation found for this permission.', {
      unsupported_permission_id: permission.permission_id,
    });
  }

  try {
    return await probeHandler(permission, deps);
  } catch (error) {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.ERROR, error?.message || 'Permission probe failed.', {
      error: String(error?.message || error),
    });
  }
}

const REQUEST_HANDLERS = Object.freeze({
  screen_capture: requestScreenCapturePermission,
  input_control_accessibility: (permission, deps) => requestInputControlPermission(permission, deps, {
    rerunProbe: runPermissionProbe,
  }),
  system_events_automation: requestSystemEventsAutomationPermission,
  microphone: (permission, deps) => requestMicrophonePermission(permission, deps, {
    rerunProbe: runPermissionProbe,
  }),
  app_management: requestAppManagementPermission,
  filesystem_workspace_access: (permission, deps) => requestFilesystemWorkspaceAccessPermission(permission, deps, {
    rerunProbe: runPermissionProbe,
  }),
  shell_execution: requestShellExecutionPermission,
  browser_automation: (permission, deps) => requestBrowserAutomationPermission(permission, deps, {
    verifyAppManagementCapability,
  }),
});

async function requestPermission(permissionId, deps = {}) {
  const permission = PERMISSION_DEFINITION_BY_ID.get(permissionId);
  if (!permission) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, 'Unknown permission id.', {
      unknown_permission_id: permissionId,
    });
  }

  if (!doesPermissionApply(permission, deps)) {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.UNSUPPORTED, 'This permission does not apply on the current platform.', {
      platform: deps.platform || process.platform,
      os_scope: permission.os_scope,
    });
  }

  const requestHandler = REQUEST_HANDLERS[permissionId];
  if (typeof requestHandler !== 'function') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.UNSUPPORTED, 'No request flow implemented for this permission.', {
      permission_id: permissionId,
    });
  }

  try {
    return await requestHandler(permission, deps);
  } catch (error) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, error?.message || 'Failed to request permission.', {
      error: String(error?.message || error),
    });
  }
}

async function checkPermissions(permissionIds = null, deps = {}) {
  const ids = Array.isArray(permissionIds)
    ? permissionIds.filter((id) => typeof id === 'string' && id.length > 0)
    : Array.from(PERMISSION_DEFINITION_BY_ID.values())
      .filter((permission) => doesPermissionApply(permission, deps))
      .map((permission) => permission.permission_id);
  return await Promise.all(ids.map((permissionId) => runPermissionProbe(permissionId, deps)));
}

async function listPermissionsWithStatus(deps = {}) {
  return {
    manifest_version: String(PERMISSION_MANIFEST.manifest_version || '1'),
    generated_at: PERMISSION_MANIFEST.generated_at || null,
    permissions: listPermissionDefinitions(deps),
    statuses: await checkPermissions(null, deps),
  };
}

module.exports = {
  checkPermissions,
  runPermissionProbe,
  requestPermission,
  listPermissionsWithStatus,
};
