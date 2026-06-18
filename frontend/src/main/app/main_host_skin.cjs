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
  runsApiKeyHeader: 'x-windie-runs-key',
  env: Object.freeze({
    defaultHttpUrl: 'WINDIE_DEFAULT_BACKEND_HTTP_URL',
    defaultWsUrl: 'WINDIE_DEFAULT_BACKEND_WS_URL',
  }),
});

const vmWorker = Object.freeze({
  env: Object.freeze({
    vmMode: 'WINDIE_VM_MODE',
    vmWorkerMode: 'WINDIE_VM_WORKER_MODE',
    workspaceId: 'WINDIE_VM_WORKSPACE_ID',
    workerId: 'WINDIE_VM_WORKER_ID',
    vmId: 'WINDIE_VM_ID',
    agentId: 'WINDIE_VM_AGENT_ID',
    heartbeatMs: 'WINDIE_VM_WORKER_HEARTBEAT_MS',
    runsApiKeys: Object.freeze([
      'WINDIE_VM_RUNS_API_KEY',
      'WINDIE_RUNS_API_KEY',
    ]),
  }),
});

const assets = Object.freeze({
  appIconFileName: 'windieos.app.png',
});

const dataPaths = Object.freeze({
  appDataDirName: 'windieos',
  env: Object.freeze({
    diagnosticsDb: 'WINDIE_APP_DIAGNOSTICS_DB',
    userDataDir: 'WINDIE_USER_DATA_DIR',
  }),
});

const diagnostics = Object.freeze({
  dataPaths,
  localRuntimeErrorMarkers: Object.freeze(['sidecar']),
});

const runtimePaths = Object.freeze({
  packagedEntrypointDirName: 'sidecar',
  env: Object.freeze({
    pythonPath: 'WINDIE_PYTHON_PATH',
  }),
});

const gpu = Object.freeze({
  env: Object.freeze({
    forceSoftwareRendering: 'WINDIE_FORCE_SOFTWARE_RENDERING',
  }),
});

const extensions = Object.freeze({
  env: Object.freeze({
    contributionsDir: 'WINDIE_AGENT_CONTRIBUTIONS_DIR',
  }),
});

const mcp = Object.freeze({
  env: Object.freeze({
    enabledServers: 'WINDIE_ENABLED_MCPS',
  }),
});

const logging = Object.freeze({
  logDirSegments: Object.freeze(['.windie', 'logs']),
  layerOverrides: Object.freeze({
    'local-runtime': Object.freeze({
      aliases: Object.freeze(['sidecar']),
      envTokens: Object.freeze(['LOCAL_RUNTIME', 'SIDECAR']),
      fileName: 'sidecar.log',
    }),
  }),
  env: Object.freeze({
    layerLogFilePrefix: 'WINDIE',
    rendererVerboseLogFile: 'WINDIE_RENDERER_VERBOSE_LOG_FILE',
  }),
});

const debug = Object.freeze({
  env: Object.freeze({
    chatPill: 'WINDIE_DEBUG_CHAT_PILL',
    devUi: 'WINDIE_DEV_UI',
    ghostOverlay: 'WINDIE_DEBUG_GHOST_OVERLAY',
    ipcStdout: 'WINDIE_DEBUG_IPC_STDOUT',
    liveSurface: 'WINDIE_DEBUG_LIVE_SURFACE',
    localRuntimeStdout: 'WINDIE_DEBUG_LOCAL_RUNTIME_STDOUT',
    startupStdout: 'WINDIE_DEBUG_STARTUP_STDOUT',
    streamEvents: 'WINDIE_DEBUG_STREAM_EVENTS',
    surfaceStdout: 'WINDIE_DEBUG_SURFACE_STDOUT',
    toolScreenshot: 'WINDIE_DEBUG_TOOL_SCREENSHOT',
    wakewordStdout: 'WINDIE_DEBUG_WAKEWORD_STDOUT',
  }),
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
});

const localRuntime = Object.freeze({
  daemonEntrypoint: 'sidecar_daemon.py',
  env: Object.freeze({
    backendHttpUrl: 'WINDIE_BACKEND_HTTP_URL',
    backendAuthStatePath: 'WINDIE_BACKEND_AUTH_STATE_PATH',
    semanticSummarizer: 'WINDIE_ENABLE_SEMANTIC_SUMMARIZER',
    packagedApp: 'WINDIE_PACKAGED_APP',
    browserFeaturePackAutoinstall: 'WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL',
    sourcePath: 'WINDIE_LOCAL_RUNTIME_SOURCE_PATH',
    sourceStamp: 'WINDIE_LOCAL_RUNTIME_SOURCE_STAMP',
    permissionStatePath: 'WINDIE_PERMISSION_STATE_PATH',
    userDataDir: 'WINDIE_USER_DATA_DIR',
    logLevel: 'WINDIE_SIDECAR_LOG_LEVEL',
    verboseStderr: 'WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR',
  }),
  browserWarmupExplanation: `Open the ${productName} browser for onboarding and profile setup.`,
});

const wakeword = Object.freeze({
  env: Object.freeze({
    packagedApp: 'WINDIE_PACKAGED_APP',
    allowRuntimeDownload: 'WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD',
  }),
  stderrLogMarkers: Object.freeze(['hey_jarvis']),
});

const mainHostSkin = Object.freeze({
  productName,
  identity,
  assets,
  dataPaths,
  diagnostics,
  runtimePaths,
  gpu,
  extensions,
  mcp,
  logging,
  debug,
  hostedBackend,
  vmWorker,
  queryEvents,
  bundledRuntime,
  localRuntime,
  wakeword,
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
