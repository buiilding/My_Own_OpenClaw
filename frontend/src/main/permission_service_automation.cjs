const {
  PERMISSION_STATUS,
  buildProbeResult,
  getStoredPermissionEntry,
  openExternal,
  setStoredPermissionEntry,
} = require('./permission_service_runtime.cjs');

const MACOS_APP_MANAGEMENT_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles';

async function verifyMacOsSystemEventsAutomationPermission(deps = {}) {
  if (typeof deps.probeMacOsSystemEventsAutomationPermission !== 'function') {
    return {
      granted: false,
      reason: 'System Events automation probe is unavailable.',
      details: {},
    };
  }

  try {
    const result = await deps.probeMacOsSystemEventsAutomationPermission();
    return result && typeof result === 'object'
      ? {
        granted: result.granted === true,
        reason: typeof result.reason === 'string' ? result.reason : '',
        details: result.details && typeof result.details === 'object' ? result.details : result,
      }
      : {
        granted: result === true,
        reason: result === true ? '' : 'System Events automation verification failed.',
        details: {},
      };
  } catch (error) {
    return {
      granted: false,
      reason: error?.message || 'System Events automation verification failed.',
      details: {
        error: String(error?.message || error),
      },
    };
  }
}

async function requestMacOsSystemEventsAutomationPermission(deps = {}) {
  if (typeof deps.requestMacOsSystemEventsAutomationPermission !== 'function') {
    return {
      granted: false,
      reason: 'System Events automation request flow is unavailable.',
      details: {},
    };
  }

  try {
    const result = await deps.requestMacOsSystemEventsAutomationPermission();
    return result && typeof result === 'object'
      ? {
        granted: result.granted === true,
        reason: typeof result.reason === 'string' ? result.reason : '',
        details: result.details && typeof result.details === 'object' ? result.details : result,
      }
      : {
        granted: result === true,
        reason: result === true ? '' : 'System Events automation request failed.',
        details: {},
      };
  } catch (error) {
    return {
      granted: false,
      reason: error?.message || 'System Events automation request failed.',
      details: {
        error: String(error?.message || error),
      },
    };
  }
}

async function verifyAppManagementCapability(permissionId, deps = {}) {
  const storedEntry = await getStoredPermissionEntry(permissionId, deps);
  if (storedEntry?.granted === true) {
    return {
      granted: true,
      reason: 'App Management access is configured for WindieOS.',
      details: {
        stored_entry: storedEntry,
      },
    };
  }

  return {
    granted: false,
    reason: (
      'Allow App Management for WindieOS on macOS before opening the browser so '
      + 'Privacy & Security does not block browser setup.'
    ),
    details: {
      stored_entry: storedEntry,
    },
  };
}

function warmBrowserResultReachedGrantedState(warmResult = {}) {
  if (!warmResult || warmResult.success !== true) {
    return false;
  }

  const details = warmResult.details && typeof warmResult.details === 'object'
    ? warmResult.details
    : {};

  if (
    details.app_management_prompt_shown === true
    || details.needs_app_management === true
    || details.blocked_by_app_management === true
    || details.awaiting_external_grant === true
  ) {
    return false;
  }

  return true;
}

async function openAppManagementSettings(deps = {}) {
  return await openExternal(MACOS_APP_MANAGEMENT_SETTINGS_URL, deps);
}

async function probeSystemEventsAutomation(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;

  if (platform !== 'darwin') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.UNSUPPORTED, 'System Events automation applies only to macOS.', {
      platform,
      os_scope: permission.os_scope,
    });
  }

  const capability = await verifyMacOsSystemEventsAutomationPermission(deps);
  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'System Events automation access is granted.', {
      platform,
      verification: capability.details,
    });
  }

  return buildProbeResult(
    permissionId,
    PERMISSION_STATUS.NEEDS_ACTION,
    capability.reason || 'System Events automation access is not yet available.',
    {
      platform,
      verification: capability.details,
      remediation: (
        'Click Grant to show the macOS Automation prompt, then allow WindieOS to control System Events. '
        + 'If you already denied it, reopen System Settings -> Privacy & Security -> Automation and enable WindieOS under System Events.'
      ),
    },
  );
}

async function probeAppManagement(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;

  if (platform !== 'darwin') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.UNSUPPORTED, 'App Management applies only to macOS.', {
      platform,
      os_scope: permission.os_scope,
    });
  }

  const capability = await verifyAppManagementCapability(permissionId, deps);
  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, capability.reason, {
      platform,
      capability_check: capability,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason, {
    platform,
    capability_check: capability,
    remediation: 'When macOS opens App Management, enable WindieOS there before using Open browser.',
  });
}

async function requestSystemEventsAutomationPermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;

  if (platform !== 'darwin') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.UNSUPPORTED, 'System Events automation applies only to macOS.', {
      platform,
      os_scope: permission.os_scope,
    });
  }

  const requestResult = await requestMacOsSystemEventsAutomationPermission(deps);
  if (requestResult.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'System Events automation access is granted.', {
      platform,
      verification: requestResult.details,
    });
  }

  return buildProbeResult(
    permissionId,
    PERMISSION_STATUS.NEEDS_ACTION,
    requestResult.reason || 'System Events automation access was not granted.',
    {
      platform,
      verification: requestResult.details,
      remediation: (
        'Approve the macOS Automation prompt for WindieOS. If the prompt no longer appears, '
        + 'open System Settings -> Privacy & Security -> Automation and enable WindieOS under System Events.'
      ),
    },
  );
}

async function requestAppManagementPermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;

  if (platform !== 'darwin') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.UNSUPPORTED, 'App Management applies only to macOS.', {
      platform,
      os_scope: permission.os_scope,
    });
  }

  if (typeof deps.warmBrowserAutomationPermission !== 'function') {
    const settingsResult = await openAppManagementSettings(deps);
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      settingsResult.success
        ? 'Waiting for App Management access. Enable WindieOS in System Settings.'
        : 'Open App Management settings and enable WindieOS.',
      {
        platform,
        awaiting_external_grant: settingsResult.success === true,
        settings_result: settingsResult,
        remediation: 'Enable WindieOS in System Settings > Privacy & Security > App Management, then return to onboarding.',
      },
    );
  }

  const warmResult = await deps.warmBrowserAutomationPermission();
  if (warmBrowserResultReachedGrantedState(warmResult)) {
    await setStoredPermissionEntry(permissionId, {
      granted: true,
      source: 'os',
      details: {
        verification: warmResult.details && typeof warmResult.details === 'object'
          ? warmResult.details
          : {},
      },
    }, deps);

    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'App Management access was granted during browser warmup.', {
      platform,
      verification: warmResult.details && typeof warmResult.details === 'object'
        ? warmResult.details
        : {},
    });
  }

  const settingsResult = await openAppManagementSettings(deps);

  return buildProbeResult(
    permissionId,
    PERMISSION_STATUS.NEEDS_ACTION,
    settingsResult.success
      ? 'Waiting for App Management access. Enable WindieOS in System Settings.'
      : 'Open App Management settings and enable WindieOS.',
    {
      platform,
      awaiting_external_grant: settingsResult.success === true,
      verification: warmResult && typeof warmResult === 'object' ? (warmResult.details || warmResult) : {},
      settings_result: settingsResult,
      remediation: 'Enable WindieOS in System Settings > Privacy & Security > App Management, then return to onboarding and let WindieOS re-check.',
    },
  );
}

module.exports = {
  probeAppManagement,
  probeSystemEventsAutomation,
  requestAppManagementPermission,
  requestSystemEventsAutomationPermission,
  verifyAppManagementCapability,
};
