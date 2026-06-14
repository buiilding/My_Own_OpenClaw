/**
 * Implements the permission service browser service for the Electron main process.
 */

const {
  PERMISSION_STATUS,
  buildProbeResult,
} = require('./permission_service_runtime.cjs');

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

  if (!capability.granted) {
    return buildProbeResult(
      permissionId,
      PERMISSION_STATUS.NEEDS_ACTION,
      capability.reason || 'Browser automation runtime is unavailable.',
      {
        platform,
        browser_automation_enabled: requestedPreferenceEnabled,
        capability_check: capability,
      },
    );
  }

  return await buildWarmGrantedStatus();
}

module.exports = {
  probeBrowserAutomation,
  requestBrowserAutomationPermission,
  verifyBrowserAutomationCapability,
};
