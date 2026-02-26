const PERMISSION_MANIFEST = require('../shared/permissions/permission_manifest.json');

const PERMISSION_STATUS = Object.freeze({
  GRANTED: 'granted',
  NEEDS_ACTION: 'needs-action',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error',
});

const PERMISSION_DEFINITIONS = Array.isArray(PERMISSION_MANIFEST.permissions)
  ? PERMISSION_MANIFEST.permissions
  : [];
const PERMISSION_DEFINITION_BY_ID = new Map(
  PERMISSION_DEFINITIONS.map((permission) => [permission.permission_id, permission]),
);

function nowIso() {
  return new Date().toISOString();
}

function clonePermissionDefinition(permission) {
  return {
    permission_id: permission.permission_id,
    label: permission.label,
    description: permission.description,
    risk_level: permission.risk_level,
    required_now: permission.required_now === true,
    required_for_planned_system_access: permission.required_for_planned_system_access === true,
    os_scope: permission.os_scope,
    validation_probe: permission.validation_probe,
    unlocks_tool_groups: Array.isArray(permission.unlocks_tool_groups)
      ? [...permission.unlocks_tool_groups]
      : [],
  };
}

function buildProbeResult(permissionId, status, reason, details = {}) {
  return {
    permission_id: permissionId,
    status,
    granted: status === PERMISSION_STATUS.GRANTED,
    reason,
    checked_at: nowIso(),
    details,
  };
}

function normalizeMediaAccessStatus(rawStatus) {
  if (typeof rawStatus !== 'string') {
    return 'unknown';
  }
  return rawStatus.trim().toLowerCase();
}

function getMediaAccessStatus(mediaType, deps = {}) {
  const systemPreferences = deps.systemPreferences;
  if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
    return 'unknown';
  }
  try {
    return normalizeMediaAccessStatus(systemPreferences.getMediaAccessStatus(mediaType));
  } catch (_error) {
    return 'unknown';
  }
}

function probeScreenCapture(permission, deps = {}) {
  const platform = deps.platform || process.platform;
  if (platform === 'darwin') {
    const mediaStatus = getMediaAccessStatus('screen', deps);
    if (mediaStatus === 'granted') {
      return buildProbeResult(permission.permission_id, PERMISSION_STATUS.GRANTED, 'Screen recording access is granted.', {
        media_status: mediaStatus,
      });
    }
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.NEEDS_ACTION, 'Grant Screen Recording in System Settings > Privacy & Security.', {
      media_status: mediaStatus,
      remediation: 'Open System Settings -> Privacy & Security -> Screen Recording and enable WindieOS.',
    });
  }

  return buildProbeResult(permission.permission_id, PERMISSION_STATUS.GRANTED, 'Screen capture is available on this platform profile.', {
    platform,
  });
}

function probeInputControl(permission, deps = {}) {
  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;

  if (platform === 'darwin') {
    const trusted = Boolean(
      systemPreferences
      && typeof systemPreferences.isTrustedAccessibilityClient === 'function'
      && systemPreferences.isTrustedAccessibilityClient(false),
    );
    if (trusted) {
      return buildProbeResult(permission.permission_id, PERMISSION_STATUS.GRANTED, 'Accessibility access is granted.', {
        trusted,
      });
    }

    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.NEEDS_ACTION, 'Grant Accessibility access in System Settings > Privacy & Security.', {
      trusted,
      remediation: 'Open System Settings -> Privacy & Security -> Accessibility and enable WindieOS.',
    });
  }

  return buildProbeResult(permission.permission_id, PERMISSION_STATUS.GRANTED, 'Input control available for this platform profile.', {
    platform,
  });
}

function probeMicrophone(permission, deps = {}) {
  const mediaStatus = getMediaAccessStatus('microphone', deps);

  if (mediaStatus === 'granted') {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.GRANTED, 'Microphone access is granted.', {
      media_status: mediaStatus,
    });
  }

  if (mediaStatus === 'unknown') {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.NEEDS_ACTION, 'Microphone access could not be verified yet.', {
      media_status: mediaStatus,
    });
  }

  return buildProbeResult(permission.permission_id, PERMISSION_STATUS.NEEDS_ACTION, 'Enable microphone access for WindieOS in OS privacy settings.', {
    media_status: mediaStatus,
  });
}

function probeRuntimeCapability(permission, deps = {}) {
  return buildProbeResult(permission.permission_id, PERMISSION_STATUS.GRANTED, 'Runtime capability probe is scaffolded for Phase 1.', {
    probe_stub: true,
    platform: deps.platform || process.platform,
  });
}

function probeConsentOnly(permission) {
  return buildProbeResult(permission.permission_id, PERMISSION_STATUS.GRANTED, 'Consent-only permission; runtime capability remains disabled until feature launch.', {
    consent_only: true,
  });
}

function runPermissionProbe(permissionId, deps = {}) {
  const permission = PERMISSION_DEFINITION_BY_ID.get(permissionId);
  if (!permission) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, 'Unknown permission id.', {
      unknown_permission_id: permissionId,
    });
  }

  try {
    switch (permission.permission_id) {
      case 'screen_capture':
        return probeScreenCapture(permission, deps);
      case 'input_control_accessibility':
        return probeInputControl(permission, deps);
      case 'microphone':
        return probeMicrophone(permission, deps);
      case 'planned_system_access':
        return probeConsentOnly(permission);
      case 'filesystem_workspace_access':
      case 'shell_execution':
      case 'browser_automation':
        return probeRuntimeCapability(permission, deps);
      default:
        return buildProbeResult(permission.permission_id, PERMISSION_STATUS.UNSUPPORTED, 'No probe implementation found for this permission.', {
          unsupported_permission_id: permission.permission_id,
        });
    }
  } catch (error) {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.ERROR, error?.message || 'Permission probe failed.', {
      error: String(error?.message || error),
    });
  }
}

async function requestPermission(permissionId, deps = {}) {
  const permission = PERMISSION_DEFINITION_BY_ID.get(permissionId);
  if (!permission) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, 'Unknown permission id.', {
      unknown_permission_id: permissionId,
    });
  }

  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;
  const shell = deps.shell;

  if (permissionId === 'microphone') {
    if (systemPreferences && typeof systemPreferences.askForMediaAccess === 'function') {
      try {
        await systemPreferences.askForMediaAccess('microphone');
      } catch (error) {
        return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, error?.message || 'Failed to request microphone access.', {
          error: String(error?.message || error),
        });
      }
    }
    return runPermissionProbe(permissionId, deps);
  }

  if (platform === 'darwin' && shell && typeof shell.openExternal === 'function') {
    if (permissionId === 'screen_capture') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
    if (permissionId === 'input_control_accessibility') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
  }

  return runPermissionProbe(permissionId, deps);
}

function listPermissionDefinitions() {
  return PERMISSION_DEFINITIONS.map(clonePermissionDefinition);
}

function checkPermissions(permissionIds = null, deps = {}) {
  const ids = Array.isArray(permissionIds)
    ? permissionIds.filter((id) => typeof id === 'string' && id.length > 0)
    : PERMISSION_DEFINITIONS.map((permission) => permission.permission_id);
  return ids.map((permissionId) => runPermissionProbe(permissionId, deps));
}

function listPermissionsWithStatus(deps = {}) {
  return {
    manifest_version: String(PERMISSION_MANIFEST.manifest_version || '1'),
    generated_at: PERMISSION_MANIFEST.generated_at || null,
    permissions: listPermissionDefinitions(),
    statuses: checkPermissions(null, deps),
  };
}

module.exports = {
  checkPermissions,
  runPermissionProbe,
  requestPermission,
  listPermissionsWithStatus,
};
