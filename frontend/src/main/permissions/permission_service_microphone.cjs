/**
 * Implements the permission service microphone service for the Electron main process.
 */

const {
  PERMISSION_STATUS,
  buildProbeResult,
  getMediaAccessStatus,
  openExternal,
  openLinuxPermissionCenter,
  parseAllowedValue,
  runCommand,
  runFirstSuccessfulCommand,
} = require('./permission_service_runtime.cjs');

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

async function requestMicrophonePermission(permission, deps = {}, services = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;
  const systemPreferences = deps.systemPreferences;
  const rerunProbe = typeof services.rerunProbe === 'function'
    ? services.rerunProbe
    : async () => probeMicrophone(permission, deps);
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
      return await rerunProbe(permissionId, deps);
    }
  }

  let settingsResult = { success: false, reason: 'No fallback settings action attempted.' };
  if (!promptResult.success && !rendererPromptResult.success) {
    if (platform === 'win32') {
      settingsResult = await openExternal('ms-settings:privacy-microphone', deps);
    } else if (platform === 'linux') {
      settingsResult = await openLinuxPermissionCenter('microphone', deps);
    }
  }

  const probe = await rerunProbe(permissionId, deps);
  if (probe.status === PERMISSION_STATUS.GRANTED) {
    return probe;
  }

  if (platform === 'linux' || platform === 'win32') {
    const verifyResult = await verifyMicrophoneCapability(deps);
    if (verifyResult.granted) {
      return await rerunProbe(permissionId, deps);
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

module.exports = {
  probeMicrophone,
  requestMicrophonePermission,
};
