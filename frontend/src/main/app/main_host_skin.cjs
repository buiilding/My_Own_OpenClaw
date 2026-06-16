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
  runtimeStillUnavailable: 'Browser automation runtime is still unavailable. Retry Enable in a few seconds.',
  runtimeUnavailable: (
    `Browser automation runtime is unavailable in this build. Reinstall ${productName} `
    + 'or install browser feature pack dependencies.'
  ),
  installFailure: 'Failed to install Chromium runtime.',
  openFailure: `Failed to open the ${productName} browser.`,
});

const macAutomation = Object.freeze({
  probeFailure: `${productName} could not verify macOS Automation permission yet.`,
  requestFailure: `${productName} could not request macOS Automation permission.`,
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
