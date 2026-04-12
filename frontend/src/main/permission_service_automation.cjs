const {
  PERMISSION_STATUS,
  buildProbeResult,
} = require('./permission_service_runtime.cjs');

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

module.exports = {
  probeSystemEventsAutomation,
  requestSystemEventsAutomationPermission,
};
