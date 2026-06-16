/**
 * Implements the permission service input control service for the Electron main process.
 */

const {
  PERMISSION_STATUS,
  buildProbeResult,
  openExternal,
  openLinuxPermissionCenter,
  runCommand,
  runFirstSuccessfulCommand,
} = require('./permission_service_runtime.cjs');

function getInputControlCopy(deps = {}) {
  const copy = deps.mainHostSkin?.permissions?.inputControl || {};
  return {
    accessibilityRemediation: copy.accessibilityRemediation || 'Open System Settings -> Privacy & Security -> Accessibility and enable this app.',
  };
}

async function verifyInputControlCapability(deps = {}) {
  if (typeof deps.verifyInputControlCapability === 'function') {
    const result = await deps.verifyInputControlCapability(deps);
    return result && typeof result === 'object'
      ? { granted: result.granted === true, details: result.details || result }
      : { granted: result === true, details: {} };
  }

  const platform = deps.platform || process.platform;
  if (platform === 'win32') {
    const result = await runCommand('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms"); [void][System.Windows.Forms.Cursor]::Position;',
    ], deps);
    return {
      granted: result?.success === true,
      details: { platform, command_result: result },
    };
  }

  if (platform === 'linux') {
    const result = await runFirstSuccessfulCommand([
      { command: 'bash', args: ['-lc', 'gsettings get org.gnome.desktop.interface toolkit-accessibility 2>/dev/null | grep -qi true'] },
      { command: 'bash', args: ['-lc', 'test "${XDG_SESSION_TYPE:-}" = "x11" && command -v xdotool >/dev/null 2>&1'] },
      { command: 'bash', args: ['-lc', 'command -v ydotool >/dev/null 2>&1'] },
    ], deps);
    return {
      granted: result?.success === true,
      details: { platform, command_result: result },
    };
  }

  return {
    granted: false,
    details: {
      platform,
      reason: 'No input-control verifier available for this platform.',
    },
  };
}

async function probeInputControl(permission, deps = {}) {
  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;
  const permissionId = permission.permission_id;
  const copy = getInputControlCopy(deps);

  if (platform === 'darwin') {
    const trusted = Boolean(
      systemPreferences
      && typeof systemPreferences.isTrustedAccessibilityClient === 'function'
      && systemPreferences.isTrustedAccessibilityClient(false),
    );
    if (trusted) {
      return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Accessibility access is granted.', {
        trusted,
      });
    }

    return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Grant Accessibility access in System Settings > Privacy & Security.', {
      trusted,
      remediation: copy.accessibilityRemediation,
    });
  }

  const capability = await verifyInputControlCapability(deps);
  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Input-control capability is available.', {
      platform,
      verification: capability.details,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Input control is not yet available on this system.', {
    platform,
    verification: capability.details,
  });
}

async function requestInputControlPermission(permission, deps = {}, services = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;
  const rerunProbe = typeof services.rerunProbe === 'function'
    ? services.rerunProbe
    : async () => probeInputControl(permission, deps);

  if (platform === 'darwin') {
    if (systemPreferences && typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
      systemPreferences.isTrustedAccessibilityClient(true);
    }

    return await rerunProbe(permissionId, deps);
  }

  if (platform === 'linux' || platform === 'win32') {
    const initialVerify = await verifyInputControlCapability(deps);
    if (initialVerify.granted) {
      return await rerunProbe(permissionId, deps);
    }
  }

  let settingsResult = { success: false, reason: 'No settings action attempted.' };
  if (platform === 'win32') {
    settingsResult = await openExternal('ms-settings:easeofaccess-keyboard', deps);
  } else if (platform === 'linux') {
    settingsResult = await openLinuxPermissionCenter('input_control_accessibility', deps);
  }

  if (platform === 'linux' || platform === 'win32') {
    const verifyResult = await verifyInputControlCapability(deps);
    if (verifyResult.granted) {
      return await rerunProbe(permissionId, deps);
    }

    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      'Input control is not yet granted. Enable OS assistive/input control and try again.',
      {
        platform,
        settings_result: settingsResult,
        verification: verifyResult.details,
      },
    );
  }

  if (settingsResult.success) {
    return await rerunProbe(permissionId, deps);
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Failed to open input-control permission settings.', {
    platform,
    settings_result: settingsResult,
  });
}

module.exports = {
  probeInputControl,
  requestInputControlPermission,
};
