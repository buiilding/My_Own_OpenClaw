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

// Session-scoped request state for permissions without reliable probe APIs.
const REQUESTED_PERMISSION_STATE = new Map();

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

function getRequestedState(permissionId) {
  const state = REQUESTED_PERMISSION_STATE.get(permissionId);
  return state && typeof state === 'object' ? state : null;
}

function markRequestedGranted(permissionId, details = {}) {
  REQUESTED_PERMISSION_STATE.set(permissionId, {
    granted: true,
    updated_at: nowIso(),
    details,
  });
}

function markRequestedPending(permissionId, details = {}) {
  REQUESTED_PERMISSION_STATE.set(permissionId, {
    granted: false,
    updated_at: nowIso(),
    details,
  });
}

function getRequestedStateDetails(permissionId) {
  const state = getRequestedState(permissionId);
  return state ? { requested_state: state } : {};
}

function isRequestedGranted(permissionId) {
  return getRequestedState(permissionId)?.granted === true;
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

function probeScreenCapture(permission, deps = {}) {
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
      ...getRequestedStateDetails(permissionId),
    });
  }

  if (isRequestedGranted(permissionId)) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Screen capture capability was verified.', {
      platform,
      ...getRequestedStateDetails(permissionId),
    });
  }

  if (platform === 'win32') {
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      'Run Grant to verify desktop capture availability on Windows.',
      {
        platform,
        remediation: 'WindieOS will verify desktop capture directly; no Windows privacy settings step is required for standard desktop capture.',
        ...getRequestedStateDetails(permissionId),
      },
    );
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Run Grant to trigger the screen-capture permission flow on this platform.', {
    platform,
    ...getRequestedStateDetails(permissionId),
  });
}

function probeInputControl(permission, deps = {}) {
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
      ...getRequestedStateDetails(permissionId),
    });
  }

  if (platform === 'linux') {
    if (isRequestedGranted(permissionId)) {
      return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Input-control capability verified for this system.', {
        platform,
        ...getRequestedStateDetails(permissionId),
      });
    }
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      'Run Grant, then enable assistive/input control in your desktop settings.',
      {
        platform,
        ...getRequestedStateDetails(permissionId),
      },
    );
  }

  if (isRequestedGranted(permissionId)) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Input-control permission flow was completed for this platform.', {
      platform,
      ...getRequestedStateDetails(permissionId),
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Run Grant to start input-control permission setup for this platform.', {
    platform,
    ...getRequestedStateDetails(permissionId),
  });
}

function probeMicrophone(permission, deps = {}) {
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
      ...getRequestedStateDetails(permissionId),
    });
  }

  if (platform === 'linux') {
    if (isRequestedGranted(permissionId)) {
      return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Microphone capability verified for this system.', {
        media_status: mediaStatus,
        platform,
        ...getRequestedStateDetails(permissionId),
      });
    }
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      'Run Grant, then approve microphone access in the desktop permission prompt.',
      {
        media_status: mediaStatus,
        platform,
        ...getRequestedStateDetails(permissionId),
      },
    );
  }

  if (isRequestedGranted(permissionId)) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Microphone permission flow was completed on this platform.', {
      media_status: mediaStatus,
      ...getRequestedStateDetails(permissionId),
    });
  }

  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Run Grant to request microphone permission.', {
    media_status: mediaStatus,
    ...getRequestedStateDetails(permissionId),
  });
}

function probeRuntimeCapability(permission, deps = {}) {
  const permissionId = permission.permission_id;
  if (isRequestedGranted(permissionId)) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.GRANTED, 'Permission request flow completed for this capability.', {
      platform: deps.platform || process.platform,
      ...getRequestedStateDetails(permissionId),
    });
  }
  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Run Grant to complete this capability permission flow.', {
    platform: deps.platform || process.platform,
    ...getRequestedStateDetails(permissionId),
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

function probeBrowserAutomation(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const preferenceEnabled = getBrowserAutomationPreference(deps);
  const requestedGranted = isRequestedGranted(permissionId);

  if (preferenceEnabled || requestedGranted) {
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.GRANTED,
      'Browser automation is enabled.',
      {
        platform,
        browser_automation_enabled: preferenceEnabled,
        ...getRequestedStateDetails(permissionId),
      },
    );
  }

  return buildProbeResult(
    permissionId,
    PERMISSION_STATUS.NEEDS_ACTION,
    'Enable browser automation to expose browser-control tools.',
    {
      platform,
      browser_automation_enabled: preferenceEnabled,
      ...getRequestedStateDetails(permissionId),
    },
  );
}

async function verifyBrowserAutomationCapability(deps = {}) {
  if (typeof deps.verifyBrowserAutomationCapability !== 'function') {
    return {
      granted: true,
      reason: 'Browser capability verification is not configured; treating enable as allowed.',
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
      message: 'WindieOS needs a Chromium runtime for browser automation.',
      detail: (
        'WindieOS can install Chromium now using Playwright. '
        + 'If Chromium is already installed on your system, this step will be skipped automatically.'
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
      case 'filesystem_workspace_access':
      case 'shell_execution':
        return probeRuntimeCapability(permission, deps);
      case 'browser_automation':
        return probeBrowserAutomation(permission, deps);
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
  const capability = await verifyScreenCaptureCapability(deps);
  const captureResult = capability.details?.capture_prompt_result || {
    success: false,
    reason: capability.reason || 'Desktop capture capability verification failed.',
  };

  if (platform === 'darwin') {
    await openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture', deps);
    const status = runPermissionProbe(permissionId, deps);
    markRequestedPending(permissionId, {
      flow: 'screen_capture',
      capture_prompt_result: captureResult,
    });
    return status;
  }

  if (platform === 'linux') {
    if (captureResult.success) {
      markRequestedGranted(permissionId, {
        flow: 'screen_capture_portal',
        capture_prompt_result: captureResult,
      });
      return runPermissionProbe(permissionId, deps);
    }

    markRequestedPending(permissionId, {
      flow: 'screen_capture_portal',
      capture_prompt_result: captureResult,
    });
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      'Screen capture was not granted. Click Grant and approve the system screen-share prompt.',
      {
        platform,
        capture_prompt_result: captureResult,
      },
    );
  }

  if (platform === 'win32') {
    if (capability.granted) {
      markRequestedGranted(permissionId, {
        flow: 'screen_capture_capability_check',
        capture_prompt_result: captureResult,
        capability_check: capability,
      });
      return runPermissionProbe(permissionId, deps);
    }

    markRequestedPending(permissionId, {
      flow: 'screen_capture_capability_check',
      capture_prompt_result: captureResult,
      capability_check: capability,
    });
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      capability.reason || 'Screen capture is unavailable on this Windows system.',
      {
        platform,
        capture_prompt_result: captureResult,
        capability_check: capability,
      },
    );
  }

  const settingsResult = { success: false, reason: 'No settings action attempted.' };

  if (captureResult.success || settingsResult.success) {
    markRequestedGranted(permissionId, {
      flow: 'screen_capture',
      capture_prompt_result: captureResult,
      settings_result: settingsResult,
    });
    return runPermissionProbe(permissionId, deps);
  }

  markRequestedPending(permissionId, {
    flow: 'screen_capture',
    capture_prompt_result: captureResult,
    settings_result: settingsResult,
  });
  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Failed to start the screen-capture permission flow.', {
    platform,
    capture_prompt_result: captureResult,
    settings_result: settingsResult,
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
      markRequestedPending(permissionId, { flow: 'input_control_accessibility', prompted });
      return runPermissionProbe(permissionId, deps);
    }

    markRequestedGranted(permissionId, { flow: 'input_control_accessibility', prompted });
    return runPermissionProbe(permissionId, deps);
  }

  if (platform === 'linux' || platform === 'win32') {
    const initialVerify = await verifyInputControlCapability(deps);
    if (initialVerify.granted) {
      markRequestedGranted(permissionId, {
        flow: 'input_control_accessibility_preverified',
        verification: initialVerify.details,
      });
      return runPermissionProbe(permissionId, deps);
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
      markRequestedGranted(permissionId, {
        flow: 'input_control_accessibility',
        settings_result: settingsResult,
        verification: verifyResult.details,
      });
      return runPermissionProbe(permissionId, deps);
    }

    markRequestedPending(permissionId, {
      flow: 'input_control_accessibility',
      settings_result: settingsResult,
      verification: verifyResult.details,
    });
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
    markRequestedGranted(permissionId, {
      flow: 'input_control_accessibility',
      settings_result: settingsResult,
    });
    return runPermissionProbe(permissionId, deps);
  }

  markRequestedPending(permissionId, {
    flow: 'input_control_accessibility',
    settings_result: settingsResult,
  });
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
      markRequestedGranted(permissionId, {
        flow: 'microphone_preverified',
        focus_result: focusResult,
        prompt_result: promptResult,
        renderer_prompt_result: rendererPromptResult,
        verification: initialVerify.details,
      });
      return runPermissionProbe(permissionId, deps);
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

  const probe = runPermissionProbe(permissionId, deps);
  if (probe.status === PERMISSION_STATUS.GRANTED) {
    markRequestedGranted(permissionId, {
      flow: 'microphone',
      focus_result: focusResult,
      prompt_result: promptResult,
      renderer_prompt_result: rendererPromptResult,
      settings_result: settingsResult,
    });
    return probe;
  }

  if (platform === 'linux' || platform === 'win32') {
    const verifyResult = await verifyMicrophoneCapability(deps);
    if (verifyResult.granted) {
      markRequestedGranted(permissionId, {
        flow: 'microphone',
        focus_result: focusResult,
        prompt_result: promptResult,
        renderer_prompt_result: rendererPromptResult,
        settings_result: settingsResult,
        verification: verifyResult.details,
      });
      return runPermissionProbe(permissionId, deps);
    }

    markRequestedPending(permissionId, {
      flow: 'microphone',
      focus_result: focusResult,
      prompt_result: promptResult,
      renderer_prompt_result: rendererPromptResult,
      settings_result: settingsResult,
      verification: verifyResult.details,
    });
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

  markRequestedPending(permissionId, {
    flow: 'microphone',
    focus_result: focusResult,
    prompt_result: promptResult,
    renderer_prompt_result: rendererPromptResult,
    settings_result: settingsResult,
  });
  return probe;
}

async function requestFilesystemWorkspaceAccessPermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const dialog = deps.dialog;
  const platform = deps.platform || process.platform;

  if (!dialog || typeof dialog.showOpenDialog !== 'function') {
    markRequestedPending(permissionId, {
      flow: 'filesystem_workspace_access',
      reason: 'dialog.showOpenDialog unavailable',
    });
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
      markRequestedPending(permissionId, {
        flow: 'filesystem_workspace_access',
        canceled: true,
      });
      return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, 'Workspace access was not granted. Select a folder to continue.', {
        platform,
      });
    }

    markRequestedGranted(permissionId, {
      flow: 'filesystem_workspace_access',
      selected_paths: result.filePaths,
    });
    return runPermissionProbe(permissionId, deps);
  } catch (error) {
    markRequestedPending(permissionId, {
      flow: 'filesystem_workspace_access',
      error: error?.message || String(error),
    });
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
    markRequestedGranted(permissionId, {
      flow: 'shell_execution',
      command_result: result,
    });
    return runPermissionProbe(permissionId, deps);
  }

  markRequestedPending(permissionId, {
    flow: 'shell_execution',
    command_result: result,
  });
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
  const preferenceEnabled = getBrowserAutomationPreference(deps);
  let capability = await verifyBrowserAutomationCapability(deps);

  if (capability.granted) {
    markRequestedGranted(permissionId, {
      flow: 'browser_automation',
      browser_automation_enabled: preferenceEnabled,
      capability_check: capability,
    });
    return runPermissionProbe(permissionId, deps);
  }

  if (shouldPromptBrowserRuntimeInstall(capability)) {
    const consent = await requestBrowserInstallConsent(deps);
    if (!consent.granted) {
      markRequestedPending(permissionId, {
        flow: 'browser_automation',
        browser_automation_enabled: preferenceEnabled,
        capability_check: capability,
        install_prompt: consent,
      });
      return buildProbeResult(
        permissionId,
        PERMISSION_STATUS.NEEDS_ACTION,
        consent.reason || 'Chromium install was not approved.',
        {
          platform,
          browser_automation_enabled: preferenceEnabled,
          capability_check: capability,
          install_prompt: consent,
        },
      );
    }

    const installResult = await requestBrowserRuntimeInstall(deps);
    capability = await verifyBrowserAutomationCapability(deps);
    if (capability.granted) {
      markRequestedGranted(permissionId, {
        flow: 'browser_automation',
        browser_automation_enabled: preferenceEnabled,
        capability_check: capability,
        chromium_install: installResult,
      });
      return runPermissionProbe(permissionId, deps);
    }

    markRequestedPending(permissionId, {
      flow: 'browser_automation',
      browser_automation_enabled: preferenceEnabled,
      capability_check: capability,
      chromium_install: installResult,
    });
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      installResult.reason || capability.reason || 'Chromium install did not complete.',
      {
        platform,
        browser_automation_enabled: preferenceEnabled,
        capability_check: capability,
        chromium_install: installResult,
      },
    );
  }

  markRequestedPending(permissionId, {
    flow: 'browser_automation',
    browser_automation_enabled: preferenceEnabled,
    capability_check: capability,
  });
  return buildProbeResult(permissionId, PERMISSION_STATUS.NEEDS_ACTION, capability.reason || 'Browser automation runtime is unavailable.', {
    platform,
    browser_automation_enabled: preferenceEnabled,
    capability_check: capability,
  });
}

async function requestPermission(permissionId, deps = {}) {
  const permission = PERMISSION_DEFINITION_BY_ID.get(permissionId);
  if (!permission) {
    return buildProbeResult(permissionId, PERMISSION_STATUS.ERROR, 'Unknown permission id.', {
      unknown_permission_id: permissionId,
    });
  }

  try {
    switch (permissionId) {
      case 'screen_capture':
        return await requestScreenCapturePermission(permission, deps);
      case 'input_control_accessibility':
        return await requestInputControlPermission(permission, deps);
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

function resetPermissionRequestStateForTests() {
  REQUESTED_PERMISSION_STATE.clear();
}

module.exports = {
  checkPermissions,
  runPermissionProbe,
  requestPermission,
  listPermissionsWithStatus,
  resetPermissionRequestStateForTests,
};
