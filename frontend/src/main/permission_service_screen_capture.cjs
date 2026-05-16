const {
  PERMISSION_STATUS,
  buildProbeResult,
  getMediaAccessStatus,
} = require('./permission_service_runtime.cjs');

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

async function requestScreenCapturePermission(permission, deps = {}) {
  const permissionId = permission.permission_id;
  const platform = deps.platform || process.platform;

  if (platform === 'darwin') {
    const mediaStatus = getMediaAccessStatus('screen', deps);
    if (mediaStatus !== 'granted') {
      const captureRegistrationAttempt = await requestDesktopCapturePrompt(deps);
      const refreshedMediaStatus = getMediaAccessStatus('screen', deps);
      return buildProbeResult(
        permissionId,
        PERMISSION_STATUS.NEEDS_ACTION,
        'Waiting for Screen Recording access. Enable WindieOS in System Settings if the macOS prompt does not complete the grant.',
        {
          platform,
          media_status: refreshedMediaStatus,
          prior_media_status: mediaStatus,
          capture_registration_attempt: captureRegistrationAttempt,
          remediation: (
            'WindieOS first attempted a real desktop-capture request so macOS can register it in Screen Recording. '
            + 'Approve the native macOS prompt first; if the grant still does not land, then open System Settings -> Privacy & Security -> Screen Recording and enable WindieOS.'
          ),
        },
      );
    }

    const promptWindowFocus = typeof deps.focusPermissionPromptWindow === 'function'
      ? await deps.focusPermissionPromptWindow()
      : null;
    const capability = await verifyScreenCaptureCapability(deps);

    if (capability.granted) {
      return buildProbeResult(
        permissionId,
        PERMISSION_STATUS.GRANTED,
        'Screen capture permission verified with a real screenshot.',
        {
          platform,
          permission_prompt_window_focus: promptWindowFocus,
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
        media_status: mediaStatus,
        permission_prompt_window_focus: promptWindowFocus,
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

module.exports = {
  probeScreenCapture,
  requestScreenCapturePermission,
  verifyScreenCaptureCapability,
};
