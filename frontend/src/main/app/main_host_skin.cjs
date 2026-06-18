/**
 * WindieOS-specific host copy for the generic Electron agent host.
 */

const productName = 'WindieOS';

const identity = Object.freeze({
  appName: productName,
  sdkAgentName: productName,
  trayTooltip: productName,
  mcpClientInfo: Object.freeze({
    name: productName,
    version: '0.6.23',
  }),
  logPrefix: `[${productName}]`,
});

const hostedBackend = Object.freeze({
  httpUrl: 'https://api.windieos.com',
  wsUrl: 'wss://api.windieos.com/ws',
});

const assets = Object.freeze({
  appIconFileName: 'windieos.app.png',
});

const dataPaths = Object.freeze({
  appDataDirName: 'windieos',
});

const browserAutomation = Object.freeze({
  localRuntimeNotReady: `${productName} local runtime is not ready. Wait a moment and retry Enable.`,
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

const screenCapture = Object.freeze({
  systemSettingsRemediation: `Open System Settings -> Privacy & Security -> Screen Recording and enable ${productName}.`,
  waitingForGrant: `Waiting for Screen Recording access. Enable ${productName} in System Settings if the macOS prompt does not complete the grant.`,
  registrationRemediation: (
    `${productName} first attempted a real desktop-capture request so macOS can register it in Screen Recording. `
    + `Approve the native macOS prompt first; if the grant still does not land, then open System Settings -> Privacy & Security -> Screen Recording and enable ${productName}.`
  ),
  verificationRemediation: (
    `Open System Settings -> Privacy & Security -> Screen Recording, enable ${productName}, `
    + 'then allow the verification screenshot prompt so future auto-screenshots do not re-prompt.'
  ),
});

const inputControl = Object.freeze({
  accessibilityRemediation: `Open System Settings -> Privacy & Security -> Accessibility and enable ${productName}.`,
});

const microphone = Object.freeze({
  osPrivacyRemediation: `Enable microphone access for ${productName} in OS privacy settings.`,
});

const workspace = Object.freeze({
  folderPickerTitle: `Select workspace folder for ${productName}`,
});

const queryEvents = Object.freeze({
  sendFailure: `Your message wasn't sent because ${productName} isn't connected right now. Try again when the connection is restored.`,
  interruptedAfterAccept: `${productName} lost connection before the response finished. Retry this message after reconnecting.`,
  interruptedBeforeAccept: `${productName} lost connection before confirming the message was received. Retry this message after reconnecting.`,
});

const bundledRuntime = Object.freeze({
  missingPythonRuntime: `Bundled Python runtime not found in app resources. Please reinstall ${productName}.`,
  missingWakewordExecutable: command => (
    `Bundled wakeword executable '${command}' not found. Reinstall ${productName}.`
  ),
});

const localRuntime = Object.freeze({
  browserWarmupExplanation: `Open the ${productName} browser for onboarding and profile setup.`,
});

const mainHostSkin = Object.freeze({
  productName,
  identity,
  assets,
  dataPaths,
  hostedBackend,
  queryEvents,
  bundledRuntime,
  localRuntime,
  permissions: Object.freeze({
    browserAutomation,
    macAutomation,
    screenCapture,
    inputControl,
    microphone,
    workspace,
  }),
});

module.exports = {
  mainHostSkin,
};
