/**
 * WindieOS-specific host copy for the generic Electron agent host.
 */

const productName = 'WindieOS';

const browserAutomation = Object.freeze({
  localBackendNotReady: `${productName} local backend is not ready. Wait a moment and retry Enable.`,
  installBrowserPrompt: (
    'Browser automation is enabled, but no compatible Chrome or Chromium browser was found. '
    + `Click Grant to install Chromium for ${productName}.`
  ),
  installDialogTitle: 'Install Browser Runtime',
  installDialogConfirmLabel: 'Install Chromium',
  installDialogCancelLabel: 'Cancel',
  installDialogMessage: `${productName} needs Chrome or Chromium for browser automation.`,
  installDialogDetail: (
    `${productName} will use an installed Chrome or Chromium browser when one is available. `
    + 'If none is found, it can install Chromium now using Playwright.'
  ),
  runtimeStillUnavailable: 'Browser automation runtime is still unavailable. Retry Enable in a few seconds.',
  runtimeUnavailable: (
    `Browser automation runtime is unavailable in this build. Reinstall ${productName} `
    + 'or install browser feature pack dependencies.'
  ),
  installFailure: 'Failed to install Chromium runtime.',
  openFailure: `Failed to open the ${productName} browser.`,
  openProfileAction: `Open the ${productName} browser and sign in with the profile ${productName} should use for browser help.`,
  openRetryFailure: `${productName} could not open the browser yet. Retry Open browser.`,
  readyProfile: `${productName} browser is ready. Sign in with the profile ${productName} should use for browser help.`,
});

const macAutomation = Object.freeze({
  probeFailure: `${productName} could not verify macOS Automation permission yet.`,
  requestFailure: `${productName} could not request macOS Automation permission.`,
  probeRemediation: (
    `Click Grant to show the macOS Automation prompt, then allow ${productName} to control System Events. `
    + `If you already denied it, reopen System Settings -> Privacy & Security -> Automation and enable ${productName} under System Events.`
  ),
  requestRemediation: (
    `Approve the macOS Automation prompt for ${productName}. If the prompt no longer appears, `
    + `open System Settings -> Privacy & Security -> Automation and enable ${productName} under System Events.`
  ),
});

const mainHostSkin = Object.freeze({
  productName,
  permissions: Object.freeze({
    browserAutomation,
    macAutomation,
  }),
});

module.exports = {
  mainHostSkin,
};
