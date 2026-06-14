/**
 * Coordinates the permission service runtime for the Electron main process.
 */

const fs = require('fs');
const { spawn } = require('child_process');

const PERMISSION_MANIFEST = require('../../shared/permissions/permission_manifest.json');

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
const LINUX_PERMISSION_CENTER_COMMANDS = Object.freeze({
  privacy: Object.freeze([
    Object.freeze({ command: 'xdg-open', args: Object.freeze(['settings://privacy']) }),
    Object.freeze({ command: 'gnome-control-center', args: Object.freeze(['privacy']) }),
    Object.freeze({ command: 'systemsettings5', args: Object.freeze(['kcm_privacy']) }),
  ]),
  input_control_accessibility: Object.freeze([
    Object.freeze({ command: 'xdg-open', args: Object.freeze(['settings://accessibility']) }),
    Object.freeze({ command: 'gnome-control-center', args: Object.freeze(['universal-access']) }),
    Object.freeze({ command: 'systemsettings5', args: Object.freeze(['kcm_access']) }),
  ]),
  shell_execution: Object.freeze([
    Object.freeze({ command: 'pkexec', args: Object.freeze(['/usr/bin/true']) }),
  ]),
  browser_automation: Object.freeze([
    Object.freeze({ command: 'xdg-open', args: Object.freeze(['settings://default-apps']) }),
    Object.freeze({ command: 'gnome-control-center', args: Object.freeze(['default-applications']) }),
  ]),
});
const LINUX_PERMISSION_CENTER_TOPIC_ALIASES = Object.freeze({
  screen_capture: 'privacy',
  microphone: 'privacy',
});

function normalizePlatformScope(platform = process.platform) {
  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return platform;
  }
}

function resolveOnboardingVisibility(permission, platform = process.platform) {
  const normalizedPlatform = normalizePlatformScope(platform);
  switch (permission?.permission_id) {
    case 'screen_capture':
    case 'input_control_accessibility':
      return normalizedPlatform === 'macos' ? 'required' : 'settings';
    case 'system_events_automation':
    case 'filesystem_workspace_access':
      return 'required';
    case 'microphone':
      return normalizedPlatform === 'macos' ? 'optional' : 'settings';
    case 'browser_automation':
      return 'optional';
    case 'shell_execution':
      return 'settings';
    default:
      return permission?.required_now === true ? 'required' : 'optional';
  }
}

function permissionAppliesToPlatform(permission, platform = process.platform) {
  const osScope = typeof permission?.os_scope === 'string'
    ? permission.os_scope.trim().toLowerCase()
    : 'all';
  if (!osScope || osScope === 'all') {
    return true;
  }
  return osScope === normalizePlatformScope(platform);
}

function nowIso() {
  return new Date().toISOString();
}

function clonePermissionDefinition(permission, platform = process.platform) {
  const onboardingVisibility = resolveOnboardingVisibility(permission, platform);
  return {
    permission_id: permission.permission_id,
    label: permission.label,
    description: permission.description,
    access_kind: typeof permission.access_kind === 'string' ? permission.access_kind : 'os_permission',
    grant_action_label: typeof permission.grant_action_label === 'string' ? permission.grant_action_label : 'Grant',
    risk_level: permission.risk_level,
    required_now: permission.required_now === true,
    onboarding_required_now: onboardingVisibility === 'required',
    show_in_onboarding: onboardingVisibility !== 'settings',
    onboarding_visibility: onboardingVisibility,
    required_for_planned_system_access: permission.required_for_planned_system_access === true,
    os_scope: permission.os_scope,
    validation_probe: permission.validation_probe,
    unlocks_tool_groups: Array.isArray(permission.unlocks_tool_groups)
      ? [...permission.unlocks_tool_groups]
      : [],
  };
}

function listPermissionDefinitions(deps = {}) {
  const platform = deps.platform || process.platform;
  return PERMISSION_DEFINITIONS
    .filter((permission) => permissionAppliesToPlatform(permission, platform))
    .map((permission) => clonePermissionDefinition(permission, platform));
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

function normalizeStoredPermissionEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
    return null;
  }

  return {
    granted: rawEntry.granted === true,
    source: typeof rawEntry.source === 'string' ? rawEntry.source : 'app',
    updated_at: typeof rawEntry.updated_at === 'string' ? rawEntry.updated_at : null,
    selected_paths: Array.isArray(rawEntry.selected_paths)
      ? rawEntry.selected_paths.filter((value) => typeof value === 'string' && value.trim())
      : [],
    details: rawEntry.details && typeof rawEntry.details === 'object' && !Array.isArray(rawEntry.details)
      ? rawEntry.details
      : {},
  };
}

async function getStoredPermissionEntry(permissionId, deps = {}) {
  const store = deps.permissionStateStore;
  if (!store || typeof store.get !== 'function') {
    return null;
  }

  try {
    return normalizeStoredPermissionEntry(await store.get(permissionId));
  } catch (_error) {
    return null;
  }
}

async function setStoredPermissionEntry(permissionId, entry, deps = {}) {
  const store = deps.permissionStateStore;
  if (!store || typeof store.set !== 'function') {
    return null;
  }

  const normalizedEntry = normalizeStoredPermissionEntry({
    ...entry,
    updated_at: nowIso(),
  });
  if (!normalizedEntry) {
    return null;
  }

  try {
    await store.set(permissionId, normalizedEntry);
    return normalizedEntry;
  } catch (_error) {
    return null;
  }
}

async function runCommand(command, args = [], deps = {}, options = {}) {
  if (typeof deps.runCommand === 'function') {
    return await deps.runCommand(command, args, options);
  }

  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        success: false,
        code: typeof error?.code === 'string' ? error.code : 'ERROR',
        stdout,
        stderr,
        error: error?.message || String(error),
      });
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

async function runFirstSuccessfulCommand(specs = [], deps = {}) {
  const failures = [];
  for (const spec of specs) {
    const result = await runCommand(spec.command, spec.args || [], deps, spec.options || {});
    if (result?.success === true) {
      return {
        success: true,
        command: spec.command,
        args: spec.args || [],
        result,
      };
    }
    failures.push({
      command: spec.command,
      args: spec.args || [],
      reason: result?.error || result?.stderr || String(result?.code || 'failed'),
    });
  }

  return {
    success: false,
    failures,
  };
}

async function openExternal(url, deps = {}) {
  const shell = deps.shell;
  if (!shell || typeof shell.openExternal !== 'function') {
    return {
      success: false,
      reason: 'shell.openExternal is unavailable.',
    };
  }
  try {
    await shell.openExternal(url);
    return { success: true, url };
  } catch (error) {
    return {
      success: false,
      reason: error?.message || String(error),
      url,
    };
  }
}

async function openLinuxPermissionCenter(topic, deps = {}) {
  const resolvedTopic = LINUX_PERMISSION_CENTER_TOPIC_ALIASES[topic] || topic;
  const specs = LINUX_PERMISSION_CENTER_COMMANDS[resolvedTopic] || [];
  if (specs.length === 0) {
    return { success: false, reason: `No Linux command mapping found for ${topic}.` };
  }
  return await runFirstSuccessfulCommand(specs, deps);
}

function parseAllowedValue(rawValue) {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) {
    return 'unknown';
  }
  if (normalized.includes('allow')) {
    return 'allow';
  }
  if (normalized.includes('deny') || normalized.includes('denied') || normalized.includes('block')) {
    return 'deny';
  }
  return 'unknown';
}

function isAuthPromptCanceled(errorText) {
  const normalized = String(errorText || '').toLowerCase();
  return normalized.includes('not authorized')
    || normalized.includes('authorization was cancelled')
    || normalized.includes('user canceled')
    || normalized.includes('user cancelled')
    || normalized.includes('request dismissed')
    || normalized.includes('access is denied')
    || normalized.includes('operation was canceled');
}

module.exports = {
  PERMISSION_MANIFEST,
  PERMISSION_STATUS,
  PERMISSION_DEFINITION_BY_ID,
  buildProbeResult,
  fs,
  getMediaAccessStatus,
  getStoredPermissionEntry,
  isAuthPromptCanceled,
  listPermissionDefinitions,
  normalizePlatformScope,
  openExternal,
  openLinuxPermissionCenter,
  parseAllowedValue,
  permissionAppliesToPlatform,
  runCommand,
  runFirstSuccessfulCommand,
  setStoredPermissionEntry,
};
