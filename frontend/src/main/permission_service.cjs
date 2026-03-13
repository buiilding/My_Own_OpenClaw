const fs = require('fs');
const { spawn } = require('child_process');
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

function clonePermissionDefinition(permission) {
  return {
    permission_id: permission.permission_id,
    label: permission.label,
    description: permission.description,
    access_kind: typeof permission.access_kind === 'string' ? permission.access_kind : 'os_permission',
    grant_action_label: typeof permission.grant_action_label === 'string' ? permission.grant_action_label : 'Grant',
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

async function requestDesktopCapturePrompt(deps = {}) {
  const desktopCapturer = deps.desktopCapturer;
  if (!desktopCapturer || typeof desktopCapturer.getSources !== 'function') {
    return {
      success: false,
      reason: 'desktopCapturer.getSources is unavailable.',
    };
  }

  try {
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      reason: error?.message || String(error),
    };
  }
}

async function verifyScreenCaptureCapability(deps = {}) {
  if (typeof deps.verifyScreenCaptureCapability === 'function') {
    try {
      const result = await deps.verifyScreenCaptureCapability(deps);
      if (result && typeof result === 'object') {
        return {
          granted: result.granted === true,
          reason: typeof result.reason === 'string' ? result.reason : '',
          details: result.details && typeof result.details === 'object' ? result.details : result,
        };
      }
      return {
        granted: result === true,
        reason: result === true ? 'Screen capture capability is available.' : 'Screen capture capability verification failed.',
        details: {},
      };
    } catch (error) {
      return {
        granted: false,
        reason: error?.message || 'Screen capture capability verification failed.',
        details: {
          error: String(error?.message || error),
        },
      };
    }
  }

  const captureResult = await requestDesktopCapturePrompt(deps);
  if (captureResult.success !== true) {
    return {
      granted: false,
      reason: captureResult.reason || 'Desktop capture is unavailable.',
      details: {
        capture_prompt_result: captureResult,
      },
    };
  }

  return {
    granted: true,
    reason: 'Desktop capture is available.',
    details: {
      capture_prompt_result: captureResult,
    },
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

async function verifyMicrophoneCapability(deps = {}) {
  if (typeof deps.verifyMicrophoneCapability === 'function') {
    const result = await deps.verifyMicrophoneCapability(deps);
    return result && typeof result === 'object'
      ? { granted: result.granted === true, details: result.details || result }
      : { granted: result === true, details: {} };
  }

  const platform = deps.platform || process.platform;
  if (platform === 'darwin') {
    const mediaStatus = getMediaAccessStatus('microphone', deps);
    return {
      granted: mediaStatus === 'granted',
      details: { platform, media_status: mediaStatus },
    };
  }

  if (platform === 'win32') {
    const result = await runCommand('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$paths=@("HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone","HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged"); $value=""; foreach($p in $paths){$item=Get-ItemProperty -Path $p -ErrorAction SilentlyContinue; if($item -and $item.Value){$value=$item.Value; break}}; Write-Output $value;',
    ], deps);
    const consent = parseAllowedValue(result?.stdout);
    return {
      granted: consent === 'allow',
      details: { platform, consent, command_result: result },
    };
  }

  if (platform === 'linux') {
    const result = await runFirstSuccessfulCommand([
      { command: 'bash', args: ['-lc', 'pactl get-default-source >/dev/null 2>&1'] },
      { command: 'bash', args: ['-lc', 'wpctl status >/dev/null 2>&1'] },
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
      reason: 'No microphone verifier available for this platform.',
    },
  };
}

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

async function probeScreenCapture(permission, deps = {}) {
  const platform = deps.platform || process.platform;
  const permissionId = permission.permission_id;

  if (platform === 'darwin') {
    const mediaStatus = getMediaAccessStatus('screen', deps);
    if (mediaStatus === 'granted') {
      return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Screen recording access is granted.', {
        media_status: mediaStatus,
      });
    }
    return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Grant Screen Recording in System Settings > Privacy & Security.', {
      media_status: mediaStatus,
      remediation: 'Open System Settings -> Privacy & Security -> Screen Recording and enable WindieOS.',
    });
  }

  const capability = await verifyScreenCaptureCapability(deps);
  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Screen capture capability is available.', {
      platform,
      capability_check: capability,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason || 'Screen capture is unavailable on this platform.', {
    platform,
    capability_check: capability,
    remediation: platform === 'win32'
      ? 'Run Grant to verify desktop capture directly; no Windows privacy settings step is required.'
      : 'Run Grant to verify screen capture on this platform.',
  });
}

async function probeInputControl(permission, deps = {}) {
  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;
  const permissionId = permission.permission_id;

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
      remediation: 'Open System Settings -> Privacy & Security -> Accessibility and enable WindieOS.',
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

async function probeMicrophone(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const mediaStatus = getMediaAccessStatus('microphone', deps);

  if (mediaStatus === 'granted') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Microphone access is granted.', {
      media_status: mediaStatus,
    });
  }

  if (mediaStatus === 'denied' || mediaStatus === 'restricted') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Enable microphone access for WindieOS in OS privacy settings.', {
      media_status: mediaStatus,
    });
  }

  const capability = await verifyMicrophoneCapability(deps);
  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Microphone capability is available.', {
      media_status: mediaStatus,
      platform,
      verification: capability.details,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason || 'Microphone access is not yet available.', {
    media_status: mediaStatus,
    platform,
    verification: capability.details,
  });
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
  const capability = await verifyShellExecutionCapability(deps);

  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, capability.reason || 'Shell execution runtime is available.', {
      platform,
      verification: capability.details,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason || 'Shell execution runtime is unavailable.', {
    platform,
    verification: capability.details,
  });
}

function getBrowserAutomationPreference(deps = {}) {
  if (typeof deps.getBrowserAutomationPreference === 'function') {
    try {
      return deps.getBrowserAutomationPreference() === true;
    } catch (_error) {
      return false;
    }
  }
  return false;
}

async function probeBrowserAutomation(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const preferenceEnabled = getBrowserAutomationPreference(deps);
  const capability = await verifyBrowserAutomationCapability(deps);

  if (!preferenceEnabled) {
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      'Open the WindieOS browser and sign in with the profile WindieOS should use for browser help.',
      {
        platform,
        browser_automation_enabled: preferenceEnabled,
        capability_check: capability,
      },
    );
  }

  if (capability.granted) {
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.GRANTED,
      'Browser automation is enabled and runtime-ready.',
      {
        platform,
        browser_automation_enabled: preferenceEnabled,
        capability_check: capability,
      },
    );
  }

  return buildProbeResult(
    permissionId,
    PERMISSION_STATUS.NEEDS_ACTION,
    capability.reason || 'Browser automation runtime is unavailable.',
    {
      platform,
      browser_automation_enabled: preferenceEnabled,
      capability_check: capability,
    },
  );
}

async function verifyBrowserAutomationCapability(deps = {}) {
  if (typeof deps.verifyBrowserAutomationCapability !== 'function') {
    return {
      granted: false,
      reason: 'Browser capability verification is not configured.',
      details: {},
    };
  }

  try {
    const result = await deps.verifyBrowserAutomationCapability();
    if (result && typeof result === 'object') {
      return {
        granted: result.granted === true,
        reason: typeof result.reason === 'string' ? result.reason : '',
        details: result.details && typeof result.details === 'object' ? result.details : result,
      };
    }
    return {
      granted: result === true,
      reason: result === true ? '' : 'Browser automation runtime verification failed.',
      details: {},
    };
  } catch (error) {
    return {
      granted: false,
      reason: error?.message || 'Browser automation capability verification failed.',
      details: {
        error: String(error?.message || error),
      },
    };
  }
}

function shouldPromptBrowserRuntimeInstall(capability = {}) {
  if (!capability || typeof capability !== 'object') {
    return false;
  }
  const details = capability.details && typeof capability.details === 'object'
    ? capability.details
    : {};
  return details.missing_browser_binary === true;
}

async function requestBrowserRuntimeInstall(deps = {}) {
  if (typeof deps.installBrowserAutomationRuntime !== 'function') {
    return {
      success: false,
      reason: 'Browser runtime install callback is unavailable.',
      details: {},
    };
  }

  try {
    const result = await deps.installBrowserAutomationRuntime();
    if (result && typeof result === 'object') {
      return {
        success: result.success === true,
        reason: typeof result.error === 'string' ? result.error : '',
        details: result.details && typeof result.details === 'object' ? result.details : result,
      };
    }
    return {
      success: result === true,
      reason: result === true ? '' : 'Chromium install did not complete.',
      details: {},
    };
  } catch (error) {
    return {
      success: false,
      reason: error?.message || 'Chromium install failed.',
      details: { error: String(error?.message || error) },
    };
  }
}

async function requestBrowserInstallConsent(deps = {}) {
  const dialog = deps.dialog;
  if (!dialog || typeof dialog.showMessageBox !== 'function') {
    return {
      granted: false,
      reason: 'Install confirmation dialog is unavailable.',
      response: null,
    };
  }

  try {
    const response = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Install Chromium', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Install Browser Runtime',
      message: 'WindieOS needs Chrome or Chromium for browser automation.',
      detail: (
        'WindieOS will use an installed Chrome or Chromium browser when one is available. '
        + 'If none is found, it can install Chromium now using Playwright.'
      ),
    });
    const accepted = response?.response === 0;
    return {
      granted: accepted,
      reason: accepted ? '' : 'Chromium install was canceled by user.',
      response,
    };
  } catch (error) {
    return {
      granted: false,
      reason: error?.message || 'Failed to open Chromium install confirmation dialog.',
      response: null,
    };
  }
}

async function runPermissionProbe(permissionId, deps = {}) {
  const permission = PERMISSION_DEFINITION_BY_ID.get(permissionId);
  if (!permission) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, 'Unknown permission id.', {
      unknown_permission_id: permissionId,
    });
  }

  if (!permissionAppliesToPlatform(permission, deps.platform || process.platform)) {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.UNSUPPORTED, 'This permission does not apply on the current platform.', {
      platform: deps.platform || process.platform,
      os_scope: permission.os_scope,
    });
  }

  try {
    switch (permission.permission_id) {
      case 'screen_capture':
        return await probeScreenCapture(permission, deps);
      case 'input_control_accessibility':
        return await probeInputControl(permission, deps);
      case 'system_events_automation':
        return await probeSystemEventsAutomation(permission, deps);
      case 'microphone':
        return await probeMicrophone(permission, deps);
      case 'filesystem_workspace_access':
        return await probeFilesystemWorkspaceAccess(permission, deps);
      case 'shell_execution':
        return await probeShellExecution(permission, deps);
      case 'browser_automation':
        return await probeBrowserAutomation(permission, deps);
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

async function requestScreenCapturePermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;

  if (platform === 'darwin') {
    const settingsResult = await openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      deps,
    );
    const capability = await verifyScreenCaptureCapability(deps);

    if (capability.granted) {
      return buildProbeResult(
        permissionId,
        PERMISSION_STATUS.GRANTED,
        'Screen capture permission verified with a real screenshot.',
        {
          platform,
          settings_result: settingsResult,
          capability_check: capability,
        },
      );
    }

    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      capability.reason || 'Grant Screen Recording and allow the verification screenshot prompt.',
      {
        platform,
        media_status: getMediaAccessStatus('screen', deps),
        settings_result: settingsResult,
        capability_check: capability,
        remediation: (
          'Open System Settings -> Privacy & Security -> Screen Recording, enable WindieOS, '
          + 'then allow the verification screenshot prompt so future auto-screenshots do not re-prompt.'
        ),
      },
    );
  }

  const capability = await verifyScreenCaptureCapability(deps);
  const captureResult = capability.details?.capture_prompt_result || {
    success: false,
    reason: capability.reason || 'Desktop capture capability verification failed.',
  };

  if (capability.granted) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Screen capture capability is available.', {
      platform,
      capture_prompt_result: captureResult,
      capability_check: capability,
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason || 'Screen capture is unavailable on this platform.', {
    platform,
    capture_prompt_result: captureResult,
    capability_check: capability,
  });
}

async function requestInputControlPermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;

  if (platform === 'darwin') {
    let prompted = false;
    if (systemPreferences && typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
      prompted = Boolean(systemPreferences.isTrustedAccessibilityClient(true));
    }
    if (!prompted) {
      await openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility', deps);
      return await runPermissionProbe(permissionId, deps);
    }

    return await runPermissionProbe(permissionId, deps);
  }

  if (platform === 'linux' || platform === 'win32') {
    const initialVerify = await verifyInputControlCapability(deps);
    if (initialVerify.granted) {
      return await runPermissionProbe(permissionId, deps);
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
      return await runPermissionProbe(permissionId, deps);
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
    return await runPermissionProbe(permissionId, deps);
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Failed to open input-control permission settings.', {
    platform,
    settings_result: settingsResult,
  });
}

async function requestMicrophonePermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;
  let promptResult = { success: false, reason: 'No native prompt attempted.' };
  let rendererPromptResult = { success: false, reason: 'No renderer prompt attempted.' };
  let focusResult = { success: false, reason: 'No focus action attempted.' };

  if (platform === 'darwin' && typeof deps.focusPermissionPromptWindow === 'function') {
    try {
      const result = await deps.focusPermissionPromptWindow();
      focusResult = result && typeof result === 'object'
        ? {
          success: result.success === true,
          reason: typeof result.reason === 'string' ? result.reason : '',
          details: result.details && typeof result.details === 'object' ? result.details : {},
        }
        : {
          success: result === true,
          reason: result === true ? '' : 'Focus action did not complete.',
          details: {},
        };
    } catch (error) {
      focusResult = {
        success: false,
        reason: error?.message || String(error),
        details: {},
      };
    }
  }

  if (systemPreferences && typeof systemPreferences.askForMediaAccess === 'function') {
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      promptResult = { success: granted === true, granted: granted === true };
    } catch (error) {
      promptResult = {
        success: false,
        reason: error?.message || String(error),
      };
    }
  }

  if (platform === 'darwin' && !promptResult.success && typeof deps.requestRendererMicrophoneAccess === 'function') {
    try {
      const rendererResult = await deps.requestRendererMicrophoneAccess();
      rendererPromptResult = rendererResult && typeof rendererResult === 'object'
        ? {
          success: rendererResult.success === true,
          reason: typeof rendererResult.reason === 'string' ? rendererResult.reason : '',
          details: rendererResult.details && typeof rendererResult.details === 'object'
            ? rendererResult.details
            : {},
        }
        : {
          success: rendererResult === true,
          reason: rendererResult === true ? '' : 'Renderer microphone prompt failed.',
          details: {},
        };
    } catch (error) {
      rendererPromptResult = {
        success: false,
        reason: error?.message || String(error),
        details: {},
      };
    }
  }

  if ((platform === 'linux' || platform === 'win32') && !promptResult.success) {
    const initialVerify = await verifyMicrophoneCapability(deps);
    if (initialVerify.granted) {
      return await runPermissionProbe(permissionId, deps);
    }
  }

  let settingsResult = { success: false, reason: 'No fallback settings action attempted.' };
  if (!promptResult.success && !rendererPromptResult.success) {
    if (platform === 'darwin') {
      settingsResult = await openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone', deps);
    } else if (platform === 'win32') {
      settingsResult = await openExternal('ms-settings:privacy-microphone', deps);
    } else if (platform === 'linux') {
      settingsResult = await openLinuxPermissionCenter('microphone', deps);
    }
  }

  const probe = await runPermissionProbe(permissionId, deps);
  if (probe.status === PERMISSION_STATUS.GRANTED) {
    return probe;
  }

  if (platform === 'linux' || platform === 'win32') {
    const verifyResult = await verifyMicrophoneCapability(deps);
    if (verifyResult.granted) {
      return await runPermissionProbe(permissionId, deps);
    }

    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      'Microphone was not granted. Click Grant and allow access in the system prompt.',
      {
        platform,
        focus_result: focusResult,
        prompt_result: promptResult,
        renderer_prompt_result: rendererPromptResult,
        settings_result: settingsResult,
        verification: verifyResult.details,
      },
    );
  }

  return probe;
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

async function requestFilesystemWorkspaceAccessPermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const dialog = deps.dialog;
  const platform = deps.platform || process.platform;

  if (!dialog || typeof dialog.showOpenDialog !== 'function') {
    return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Workspace access prompt is unavailable in this runtime.', {
      platform,
    });
  }

  try {
    const result = await dialog.showOpenDialog({
      title: 'Select workspace folder for WindieOS',
      buttonLabel: 'Grant workspace access',
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
    return await runPermissionProbe(permissionId, deps);
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
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Shell execution authentication flow completed.', {
      platform,
      command_result: result,
    });
  }

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

async function requestBrowserAutomationPermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const currentPreferenceEnabled = getBrowserAutomationPreference(deps);
  let capability = await verifyBrowserAutomationCapability(deps);
  let requestedPreferenceEnabled = currentPreferenceEnabled;

  const runBrowserWarmup = async () => {
    if (typeof deps.warmBrowserAutomationPermission !== 'function') {
      return {
        success: true,
        details: {},
      };
    }

    try {
      const result = await deps.warmBrowserAutomationPermission();
      if (result && typeof result === 'object') {
        return {
          success: result.success === true,
          reason: typeof result.reason === 'string'
            ? result.reason
            : (typeof result.error === 'string' ? result.error : ''),
          details: result.details && typeof result.details === 'object'
            ? result.details
            : result,
        };
      }
      return {
        success: result === true,
        reason: result === true ? '' : 'Failed to open the WindieOS browser.',
        details: {},
      };
    } catch (error) {
      return {
        success: false,
        reason: error?.message || 'Failed to open the WindieOS browser.',
        details: {
          error: String(error?.message || error),
        },
      };
    }
  };

  const buildWarmGrantedStatus = async (extraDetails = {}) => {
    requestedPreferenceEnabled = true;
    const warmup = await runBrowserWarmup();
    if (!warmup.success) {
      return buildProbeResult(
        permissionId,
        PERMISSION_STATUS.NEEDS_ACTION,
        warmup.reason || 'WindieOS could not open the browser yet. Retry Open browser.',
        {
          platform,
          browser_automation_enabled: requestedPreferenceEnabled,
          capability_check: capability,
          browser_warmup: warmup,
          ...extraDetails,
        },
      );
    }

    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.GRANTED,
      'WindieOS browser is ready. Sign in with the profile WindieOS should use for browser help.',
      {
        platform,
        browser_automation_enabled: requestedPreferenceEnabled,
        capability_check: capability,
        browser_warmup: warmup,
        ...extraDetails,
      },
    );
  };

  if (capability.granted) {
    return await buildWarmGrantedStatus();
  }

  if (shouldPromptBrowserRuntimeInstall(capability)) {
    const consent = await requestBrowserInstallConsent(deps);
    if (!consent.granted) {
      return buildProbeResult(
        permissionId,
        PERMISSION_STATUS.NEEDS_ACTION,
        consent.reason || 'Chromium install was not approved.',
        {
          platform,
          browser_automation_enabled: currentPreferenceEnabled,
          capability_check: capability,
          install_prompt: consent,
        },
      );
    }

    const installResult = await requestBrowserRuntimeInstall(deps);
    capability = await verifyBrowserAutomationCapability(deps);
    if (capability.granted) {
      return await buildWarmGrantedStatus({
        chromium_install: installResult,
      });
    }

    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      installResult.reason || capability.reason || 'Chromium install did not complete.',
      {
        platform,
        browser_automation_enabled: requestedPreferenceEnabled,
        capability_check: capability,
        chromium_install: installResult,
      },
    );
  }

  return await buildWarmGrantedStatus();
}

async function requestPermission(permissionId, deps = {}) {
  const permission = PERMISSION_DEFINITION_BY_ID.get(permissionId);
  if (!permission) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, 'Unknown permission id.', {
      unknown_permission_id: permissionId,
    });
  }

  if (!permissionAppliesToPlatform(permission, deps.platform || process.platform)) {
    return buildProbeResult(permission.permission_id, PERMISSION_STATUS.UNSUPPORTED, 'This permission does not apply on the current platform.', {
      platform: deps.platform || process.platform,
      os_scope: permission.os_scope,
    });
  }

  try {
    switch (permissionId) {
      case 'screen_capture':
        return await requestScreenCapturePermission(permission, deps);
      case 'input_control_accessibility':
        return await requestInputControlPermission(permission, deps);
      case 'system_events_automation':
        return await requestSystemEventsAutomationPermission(permission, deps);
      case 'microphone':
        return await requestMicrophonePermission(permission, deps);
      case 'filesystem_workspace_access':
        return await requestFilesystemWorkspaceAccessPermission(permission, deps);
      case 'shell_execution':
        return await requestShellExecutionPermission(permission, deps);
      case 'browser_automation':
        return await requestBrowserAutomationPermission(permission, deps);
      default:
        return buildProbeResult(permissionId, PERMISSION_STATUS.UNSUPPORTED, 'No request flow implemented for this permission.', {
          permission_id: permissionId,
        });
    }
  } catch (error) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, error?.message || 'Failed to request permission.', {
      error: String(error?.message || error),
    });
  }
}

function listPermissionDefinitions(deps = {}) {
  const platform = deps.platform || process.platform;
  return PERMISSION_DEFINITIONS
    .filter((permission) => permissionAppliesToPlatform(permission, platform))
    .map(clonePermissionDefinition);
}

async function checkPermissions(permissionIds = null, deps = {}) {
  const ids = Array.isArray(permissionIds)
    ? permissionIds.filter((id) => typeof id === 'string' && id.length > 0)
    : PERMISSION_DEFINITIONS
      .filter((permission) => permissionAppliesToPlatform(permission, deps.platform || process.platform))
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
