/**
 * Exposes the package entrypoint for the Electron main process.
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  globalShortcut,
  shell,
  systemPreferences,
  dialog,
  desktopCapturer,
} = require('electron');
const path = require('path');
const {
  extractWorkspaceSelection,
  installApplicationMenu,
} = require('./app/app_menu_runtime.cjs');
const { mainHostSkin } = require('./app/main_host_skin.cjs');
const {
  createPermissionStateStore,
  resolveStatePath: resolvePermissionStatePath,
} = require('./permissions/permission_state_store.cjs');
const {
  getBackendConnectionState,
  getKnownAgentLocalRuntime,
  ensureAgentLocalRuntime,
  getLatestDesktopUiConfig,
  initializeIpc,
  registerBackendMessageObserver,
  registerRendererWindow,
  appendMainProcessTraceEvent,
  appendAppDiagnostic,
  sendAutomatedQuery,
  stopQueryThroughAgentSdkRuntime,
  triggerStopQueryFromMain,
  updateGlobalAgentStopShortcutStatus,
} = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword/wakeword_bridge.cjs');
const {
  initializeLocalRuntimeBridge,
  stopLocalRuntime,
  getLocalRuntimeStatus,
  installBrowserChromium,
  determineMacOsSystemEventsAutomationPermission,
  warmBrowserAutomation,
} = require('./sidecar/local_runtime_bridge.cjs');
const { createVmWorkerRuntime } = require('./app/vm_worker_runtime.cjs');
const {
  createChatWindow: createChatWindowRuntime,
  createMainWindow: createMainWindowRuntime,
  createResponseWindow: createResponseWindowRuntime,
  createTray: createTrayRuntime,
} = require('./surfaces/main_window_runtime.cjs');
const {
  initializeMainProcessLifecycleRuntime,
} = require('./app/main_process_lifecycle_runtime.cjs');
const {
  createWindowBootstrapRuntime,
} = require('./app/main_process_bootstrap_runtime.cjs');
const {
  focusWindowForPermissionPrompt,
} = require('./surfaces/main_window_controls_handler.cjs');
const { initializeOverlayPhaseHandlersRuntime } = require('./surfaces/overlay_phase_ipc_runtime.cjs');
const { initializeWindowControlHandlersRuntime } = require('./surfaces/window_controls_ipc_runtime.cjs');
const { initializePermissionHandlersRuntime } = require('./permissions/permission_ipc_runtime.cjs');
const {
  getChatWindowBounds: getOverlayChatWindowBounds,
  getResponseWindowBounds: getOverlayResponseWindowBounds,
} = require('./surfaces/overlay_bounds.cjs');
const {
  getActiveDisplayAffinity: getActiveDisplayAffinityRuntime,
  setActiveDisplayAffinity: setActiveDisplayAffinityRuntime,
  syncActiveDisplayAffinityForWindow: syncActiveDisplayAffinityForWindowRuntime,
} = require('./surfaces/display_affinity_runtime.cjs');
const { createResponseOverlayPhaseEnum } = require('./ipc/ipc_overlay_phase_contract.cjs');
const { configureGpuRuntime } = require('./app/gpu_runtime.cjs');
const { isVmModeEnabled, isVmWorkerModeEnabled } = require('./app/runtime_mode.cjs');
const {
  initializeAgentStopShortcutRuntime,
  resolveGlobalAgentStopAccelerator,
} = require('./shortcuts/agent_stop_shortcut_runtime.cjs');
const { createWindowPlatformPolicy } = require('./surfaces/window_platform_policy.cjs');
const { createSurfaceRuntime } = require('./surfaces/surface_runtime.cjs');
const {
  createSdkLiveTurnSurfaceState,
  handleSdkLiveTurnSurfaceIntent,
  resolveOverlayIntent,
} = require('./surfaces/live_turn_surface_controller.cjs');
const {
  appendSurfaceVisibilityDiagnostic,
} = require('./diagnostics/app_diagnostics_runtime.cjs');
const {
  configureAppDiagnosticsStore,
} = require('./diagnostics/app_diagnostics_store.cjs');
const {
  createElectronToolSurfaceLifecycle,
} = require('./surfaces/tool_surface_lifecycle.cjs');
const {
  readChatPillVisibilityIntent,
  writeChatPillVisibilityIntent,
} = require('./surfaces/chat_pill_visibility_intent_store.cjs');
const {
  configureLayerLogSink,
  installConsoleLayerLog,
} = require('./logging/layer_log_sink.cjs');
const {
  configureExtensionManifestRuntime,
} = require('./extensions/extension_manifest.cjs');
const {
  configureMcpRuntime,
} = require('./extensions/mcp_runtime.cjs');
const {
  configureDebugEnvRuntime,
  isDebugFlagEnabled,
} = require('./app/debug_env.cjs');

configureDebugEnvRuntime(mainHostSkin.debug);
configureAppDiagnosticsStore(mainHostSkin.diagnostics);
configureLayerLogSink(mainHostSkin.logging);
configureExtensionManifestRuntime(mainHostSkin.extensions);
configureMcpRuntime(mainHostSkin.mcp);
installConsoleLayerLog({
  layer: 'main',
  logPrefix: mainHostSkin.identity.logPrefix,
});
configureGpuRuntime({
  app,
  env: process.env,
  gpuEnv: mainHostSkin.gpu.env,
});

const WAKEWORD_HOTKEY = process.platform === 'win32'
  ? 'CommandOrControl+Alt+W'
  : 'Super+Alt+W';
const MAIN_WINDOW_OPEN_TARGET_CHANNEL = 'main-window-open-target';
const MAIN_WINDOW_OPEN_TARGETS = new Set(['chat', 'memory', 'models', 'onboarding', 'settings']);
const RESPONSE_OVERLAY_CHAT_GAP = 8;
const CHATBOX_VISUAL_ANCHOR_HEIGHT = 64;
const RESPONSE_OVERLAY_PHASE = createResponseOverlayPhaseEnum();
const ENABLE_OS_TOOL_GHOST_DEBUG = isDebugFlagEnabled('ghostOverlay');
const ENABLE_DEV_TRANSPARENCY_UI = isDebugFlagEnabled('devUi');
const ENABLE_DEBUG_STREAM_TRACE = isDebugFlagEnabled('streamEvents');
const ENABLE_DEBUG_TOOL_SCREENSHOT = isDebugFlagEnabled('toolScreenshot');
const VM_MODE_ENABLED = isVmModeEnabled(
  process.env,
  mainHostSkin.vmWorker.env,
);
const VM_WORKER_MODE_ENABLED = isVmWorkerModeEnabled(
  process.env,
  mainHostSkin.vmWorker.env,
);
const RESPONSE_WINDOW_DEBUG_VIEW = 'tool-ghost-debug';
const getUserDataPath = () => app.getPath('userData');
const getPermissionStatePath = () => resolvePermissionStatePath({
  userDataPath: getUserDataPath(),
});
const agentStopShortcutRuntime = initializeAgentStopShortcutRuntime({
  globalShortcut,
  platform: process.platform,
  accelerator: resolveGlobalAgentStopAccelerator(process.platform),
  onStop: () => {
    triggerStopQueryFromMain();
  },
  onStatusChange: updateGlobalAgentStopShortcutStatus,
  warn: console.warn,
});
updateGlobalAgentStopShortcutStatus(agentStopShortcutRuntime.getStatus());
const windowPlatformPolicy = createWindowPlatformPolicy({
  platform: process.platform,
  warn: console.warn,
});
const chatPillVisibilityIntent = ENABLE_DEV_TRANSPARENCY_UI
  ? { userHidden: false }
  : readChatPillVisibilityIntent({
    userDataPath: getUserDataPath(),
  });
let latestSdkCurrentTurnForSurface = null;
const surfaceRuntime = createSurfaceRuntime({
  screen,
  platform: process.platform,
  getActiveDisplayAffinity: getActiveDisplayAffinityRuntime,
  setActiveDisplayAffinity: setActiveDisplayAffinityRuntime,
  syncActiveDisplayAffinityForWindow: syncActiveDisplayAffinityForWindowRuntime,
  getOverlayChatWindowBounds,
  getOverlayResponseWindowBounds,
  responseGap: RESPONSE_OVERLAY_CHAT_GAP,
  initialChatVisualAnchorHeight: CHATBOX_VISUAL_ANCHOR_HEIGHT,
  responseOverlayPhaseEnum: RESPONSE_OVERLAY_PHASE,
  enableOsToolGhostDebug: ENABLE_OS_TOOL_GHOST_DEBUG,
  mainWindowOpenTargetChannel: MAIN_WINDOW_OPEN_TARGET_CHANNEL,
  mainWindowOpenTargets: MAIN_WINDOW_OPEN_TARGETS,
  windowPlatformPolicy,
  initialChatPillUserHidden: chatPillVisibilityIntent.userHidden,
  persistChatPillUserHidden: (userHidden) => {
    if (ENABLE_DEV_TRANSPARENCY_UI) {
      return;
    }
    writeChatPillVisibilityIntent({
      userHidden,
    }, {
      userDataPath: getUserDataPath(),
    });
  },
  reapplyLatestSdkLiveTurnSurfaceIntent: () => {
    if (!latestSdkCurrentTurnForSurface) {
      return {
        success: true,
        applied: false,
        reason: 'missing-latest-sdk-current-turn',
      };
    }
    return syncSdkLiveTurnSurfaceIntent(latestSdkCurrentTurnForSurface);
  },
  warn: console.warn,
});
const electronToolSurfaceLifecycle = createElectronToolSurfaceLifecycle(surfaceRuntime);
const {
  getResponseWindowBounds,
  positionChatWindow,
  positionResponseWindow,
  setManualChatWindowPosition,
} = surfaceRuntime.overlayHelpers;
const sdkLiveTurnSurfaceState = createSdkLiveTurnSurfaceState();

function syncSdkLiveTurnSurfaceIntent(currentTurn) {
  latestSdkCurrentTurnForSurface = currentTurn || null;
  const overlayIntent = resolveOverlayIntent(currentTurn);
  if (
    overlayIntent?.visible === true
    && overlayIntent.mode === 'response'
    && surfaceRuntime.isResponseOverlayGuardDismissed(overlayIntent.staleGuardRef)
  ) {
    appendSurfaceVisibilityDiagnostic({
      action: 'skip-dismissed-sdk-overlay-intent',
      mode: overlayIntent.mode,
      turnRef: overlayIntent.turnRef,
      staleGuardRef: overlayIntent.staleGuardRef,
      conversationRef: overlayIntent.conversationRef,
    });
    return {
      success: true,
      applied: false,
      ignored: true,
      reason: 'dismissed-response-overlay',
      visible: false,
      mode: overlayIntent.mode,
      turnRef: overlayIntent.turnRef,
      staleGuardRef: overlayIntent.staleGuardRef,
    };
  }
  return handleSdkLiveTurnSurfaceIntent(currentTurn, {
    responseWindow: surfaceRuntime.getResponseWindow(),
    getResponseWindowBounds,
    getResponseOverlayVisible: () => surfaceRuntime.getState().responseOverlayVisible,
    getResponseOverlayPhase: () => surfaceRuntime.getState().responseOverlayPhase,
    getActiveResponseOverlayGuardRef: surfaceRuntime.getActiveResponseOverlayGuardRef,
    setActiveResponseOverlayGuardRef: surfaceRuntime.setActiveResponseOverlayGuardRef,
    setResponseOverlayVisibilityState: surfaceRuntime.setResponseOverlayVisibilityState,
    showResponseWindowInactive: surfaceRuntime.overlayHelpers.showResponseWindowInactive,
    canShowFloatingResponseOverlay: surfaceRuntime.canShowFloatingResponseOverlay,
    surfaceState: sdkLiveTurnSurfaceState,
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
  });
}

const {
  createWindow,
  createChatWindow,
  createResponseWindow,
  createTray,
} = createWindowBootstrapRuntime({
  BrowserWindow,
  Tray,
  Menu,
  path,
  app,
  platform: process.platform,
  enableDevTransparencyUi: ENABLE_DEV_TRANSPARENCY_UI,
  enableDebugStreamTrace: ENABLE_DEBUG_STREAM_TRACE,
  enableDebugToolScreenshot: ENABLE_DEBUG_TOOL_SCREENSHOT,
  vmMode: VM_MODE_ENABLED,
  vmWorkerMode: VM_WORKER_MODE_ENABLED,
  enableOsToolGhostDebug: ENABLE_OS_TOOL_GHOST_DEBUG,
  responseWindowDebugView: RESPONSE_WINDOW_DEBUG_VIEW,
  mainHostSkin,
  initializeIpc,
  setAgentLoopStopShortcutEnabled: agentStopShortcutRuntime.setEnabled,
  initializeWakewordBridge,
  initializeLocalRuntimeBridge,
  getKnownLocalRuntime: getKnownAgentLocalRuntime,
  ensureLocalRuntime: ensureAgentLocalRuntime,
  getPermissionStatePath,
  initializeMainProcessIpc,
  createVmWorkerRuntime,
  getBackendConnectionState,
  sendAutomatedQuery,
  stopQueryThroughAgentSdkRuntime,
  registerBackendMessageObserver,
  createMainWindowRuntime,
  createChatWindowRuntime,
  createResponseWindowRuntime,
  createTrayRuntime,
  prepareOverlayQueryCaptureFocus: surfaceRuntime.prepareOverlayQueryCaptureFocus,
  showChatWindow: surfaceRuntime.showChatWindow,
  hideChatWindow: surfaceRuntime.hideChatWindow,
  showMainWindow: surfaceRuntime.showMainWindow,
  setGlobalAgentStopShortcutAccelerator: agentStopShortcutRuntime.setAccelerator,
  localToolLifecycle: electronToolSurfaceLifecycle,
  syncSdkLiveTurnSurfaceIntent,
  emitWakewordSttTrigger: surfaceRuntime.emitWakewordSttTrigger,
  positionChatWindow,
  positionResponseWindow,
  showResponseWindowInactive: surfaceRuntime.overlayHelpers.showResponseWindowInactive,
  syncWakewordToggleForChatVisibility: surfaceRuntime.syncWakewordToggleForChatVisibility,
  setResponseOverlayVisibilityState: surfaceRuntime.setResponseOverlayVisibilityState,
  enableContentProtectionSafely: surfaceRuntime.enableContentProtectionSafely,
  applyOverlayWindowPolicy: surfaceRuntime.applyOverlayWindowPolicy,
  syncWindowDisplayAffinity: surfaceRuntime.syncWindowDisplayAffinity,
  getMainWindowMode: surfaceRuntime.getMainWindowMode,
  getState: surfaceRuntime.getState,
  setMainWindow: surfaceRuntime.setMainWindow,
  setChatWindow: surfaceRuntime.setChatWindow,
  setResponseWindow: surfaceRuntime.setResponseWindow,
  setVmWorkerRuntime: surfaceRuntime.setVmWorkerRuntime,
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
});

function broadcastWorkspaceAccessUpdated(status) {
  const workspaceSelection = extractWorkspaceSelection(status);
  const payload = {
    granted: status?.granted === true,
    source: typeof status?.details?.stored_entry?.source === 'string'
      ? status.details.stored_entry.source
      : (typeof status?.source === 'string' ? status.source : ''),
    workspaceName: workspaceSelection?.workspaceName || '',
    workspacePath: workspaceSelection?.workspacePath || '',
    selectedPaths: Array.isArray(workspaceSelection?.selectedPaths)
      ? workspaceSelection.selectedPaths
      : [],
  };
  BrowserWindow.getAllWindows().forEach((windowRef) => {
    if (!windowRef || windowRef.isDestroyed()) {
      return;
    }
    windowRef.webContents.send('workspace-access-updated', payload);
  });
}

initializeMainProcessLifecycleRuntime({
  app,
  BrowserWindow,
  globalShortcut,
  screen,
  registerRendererWindow,
  wakewordHotkey: WAKEWORD_HOTKEY,
  platform: process.platform,
  vmMode: VM_MODE_ENABLED,
  createWindow,
  createChatWindow,
  createResponseWindow,
  createTray,
  installApplicationMenu: () => {
    installApplicationMenu({
      Menu,
      dialog,
      platform: process.platform,
      userDataPath: getUserDataPath(),
      permissionStateStore: createPermissionStateStore({
        userDataPath: getUserDataPath(),
      }),
      onWorkspaceAccessUpdated: ({ status }) => {
        broadcastWorkspaceAccessUpdated(status);
      },
      log: console.warn,
    });
  },
  syncWakewordToggleForChatVisibility: surfaceRuntime.syncWakewordToggleForChatVisibility,
  positionChatWindow,
  positionResponseWindow,
  hideChatWindow: surfaceRuntime.hideChatWindow,
  showChatWindow: surfaceRuntime.showChatWindow,
  showMainWindow: surfaceRuntime.showMainWindow,
  getMainWindow: surfaceRuntime.getMainWindow,
  getPrimarySurface: surfaceRuntime.getPrimarySurface,
  getMainWindowMode: surfaceRuntime.getMainWindowMode,
  getChatWindow: surfaceRuntime.getChatWindow,
  getResponseWindow: surfaceRuntime.getResponseWindow,
  stopLocalRuntime,
  stopVmWorker: surfaceRuntime.stopVmWorker,
});

function initializeMainProcessIpc() {
  surfaceRuntime.initializeMainProcessIpcOnce(() => {
    initializeOverlayPhaseHandlersRuntime({
      ipcMain,
      BrowserWindow,
      screen,
      getWindows: surfaceRuntime.getWindows,
      getState: surfaceRuntime.getState,
      positionChatWindow,
      positionResponseWindow,
      syncWindowDisplayAffinity: surfaceRuntime.syncWindowDisplayAffinity,
      setManualChatWindowPosition,
      setChatVisualAnchorHeight: surfaceRuntime.setChatVisualAnchorHeight,
      setChatWindowBoundsForVisualAnchorHeight: surfaceRuntime.overlayHelpers.setChatWindowBoundsForVisualAnchorHeight,
      setChatboxHitTestActive: surfaceRuntime.setChatboxHitTestActive,
      setResponseboxHitTestActive: surfaceRuntime.setResponseboxHitTestActive,
      resizeChatWindowForVisualAnchorHeight: surfaceRuntime.overlayHelpers.resizeChatWindowForVisualAnchorHeight,
      getResponseWindowBounds,
      setResponseOverlayVisibilityState: surfaceRuntime.setResponseOverlayVisibilityState,
      getActiveResponseOverlayGuardRef: surfaceRuntime.getActiveResponseOverlayGuardRef,
      setActiveResponseOverlayGuardRef: surfaceRuntime.setActiveResponseOverlayGuardRef,
      dismissResponseOverlayGuardRef: surfaceRuntime.dismissResponseOverlayGuardRef,
      canShowFloatingResponseOverlay: surfaceRuntime.canShowFloatingResponseOverlay,
      activateChatboxTextEntry: surfaceRuntime.activateChatboxTextEntry,
      broadcastResponseOverlayVisibility: surfaceRuntime.broadcastResponseOverlayVisibility,
      syncChatboxHitTestState: surfaceRuntime.syncChatboxHitTestState,
      syncResponseboxHitTestState: surfaceRuntime.syncResponseboxHitTestState,
      ensureResponseOverlayFallbackBounds: surfaceRuntime.overlayHelpers.ensureResponseOverlayFallbackBounds,
      showResponseWindowInactive: surfaceRuntime.overlayHelpers.showResponseWindowInactive,
      setActiveDisplayAffinity: setActiveDisplayAffinityRuntime,
      showMainWindow: surfaceRuntime.showMainWindow,
      showChatWindow: surfaceRuntime.showChatWindow,
      hideChatWindow: surfaceRuntime.hideChatWindow,
      hideMainWindow: surfaceRuntime.hideMainWindow,
      warn: console.warn,
    });

    initializeWindowControlHandlersRuntime({
      ipcMain,
      BrowserWindow,
      screen,
      getWindows: surfaceRuntime.getWindows,
      showMainWindow: surfaceRuntime.showMainWindow,
      normalizeMainWindowOpenTarget: surfaceRuntime.normalizeMainWindowOpenTarget,
      emitMainWindowOpenTarget: surfaceRuntime.emitMainWindowOpenTarget,
    });

    const browserAutomationCopy = mainHostSkin.permissions.browserAutomation;
    const macAutomationCopy = mainHostSkin.permissions.macAutomation;

    initializePermissionHandlersRuntime({
      ipcMain,
      shell,
      systemPreferences,
      dialog,
      desktopCapturer,
      permissionCopy: mainHostSkin.permissions,
      platform: process.platform,
      userDataPath: getUserDataPath(),
      focusPermissionPromptWindow: async () => {
        const mainWindow = surfaceRuntime.getMainWindow();
        return await focusWindowForPermissionPrompt({
          mainWindow,
          platform: process.platform,
        });
      },
      requestRendererMicrophoneAccess: async () => {
        const mainWindow = surfaceRuntime.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
          return {
            success: false,
            reason: 'Main window is unavailable for microphone prompt.',
          };
        }

        try {
          return await mainWindow.webContents.executeJavaScript(
            `(async () => {
              if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                return { success: false, reason: 'getUserMedia is unavailable in renderer.' };
              }
              let stream = null;
              try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                return { success: true };
              } catch (error) {
                return {
                  success: false,
                  reason: error?.message ? String(error.message) : String(error),
                };
              } finally {
                if (stream && typeof stream.getTracks === 'function') {
                  for (const track of stream.getTracks()) {
                    try {
                      track.stop();
                    } catch (_error) {
                      // Best-effort cleanup only.
                    }
                  }
                }
              }
            })()`,
            true,
          );
        } catch (error) {
          return {
            success: false,
            reason: error?.message || String(error),
          };
        }
      },
      getBrowserAutomationPreference: () => (
        getLatestDesktopUiConfig()?.browser_automation_enabled === true
      ),
      verifyBrowserAutomationCapability: async () => {
        const localRuntimeStatus = await getLocalRuntimeStatus();
        if (!localRuntimeStatus || localRuntimeStatus.success !== true || typeof localRuntimeStatus.data !== 'object') {
          return {
            granted: false,
            reason: browserAutomationCopy.localRuntimeNotReady,
            details: {
              local_runtime_status: localRuntimeStatus,
            },
          };
        }

        const payload = localRuntimeStatus.data;
        const registeredTools = Array.isArray(payload.registered_tools) ? payload.registered_tools : [];
        const hasBrowserTool = registeredTools.includes('browser');
        const featurePackAvailable = payload.browser_feature_pack_available === true;
        const browserBinaryAvailable = payload.browser_binary_available === true;
        const browserBinaryPath = typeof payload.browser_binary_path === 'string'
          ? payload.browser_binary_path
          : '';

        if (hasBrowserTool && featurePackAvailable && browserBinaryAvailable) {
          return {
            granted: true,
            details: {
              local_runtime_status: payload,
              browser_binary_path: browserBinaryPath,
            },
          };
        }

        const autoInstallEnabled = payload.browser_feature_pack_autoinstall_enabled === true;
        if (hasBrowserTool && featurePackAvailable && !browserBinaryAvailable) {
          return {
            granted: false,
            reason: browserAutomationCopy.installBrowserPrompt,
            details: {
              local_runtime_status: payload,
              missing_browser_binary: true,
              browser_binary_available: false,
            },
          };
        }

        const reason = autoInstallEnabled
          ? browserAutomationCopy.runtimeStillUnavailable
          : browserAutomationCopy.runtimeUnavailable;

        return {
          granted: false,
          reason,
          details: {
            local_runtime_status: payload,
            missing_browser_binary: false,
          },
        };
      },
      installBrowserAutomationRuntime: async () => {
        const installResult = await installBrowserChromium();
        if (!installResult || installResult.success !== true || typeof installResult.data !== 'object') {
          return {
            success: false,
            error: typeof installResult?.error === 'string'
              ? installResult.error
              : browserAutomationCopy.installFailure,
            details: installResult,
          };
        }

        return {
          success: installResult.data.success === true,
          error: typeof installResult.data.error === 'string' ? installResult.data.error : '',
          details: installResult.data,
        };
      },
      warmBrowserAutomationPermission: async () => {
        const warmResult = await warmBrowserAutomation();
        if (!warmResult || warmResult.success !== true) {
          return {
            success: false,
            error: typeof warmResult?.error === 'string'
              ? warmResult.error
              : browserAutomationCopy.openFailure,
            details: warmResult,
          };
        }

        return {
          success: true,
          details: warmResult.data,
        };
      },
      probeMacOsSystemEventsAutomationPermission: async () => {
        const probeResult = await determineMacOsSystemEventsAutomationPermission(false);
        if (!probeResult || probeResult.success !== true || typeof probeResult.data !== 'object') {
          return {
            granted: false,
            reason: typeof probeResult?.error === 'string'
              ? probeResult.error
              : macAutomationCopy.probeFailure,
            details: {
              local_runtime_result: probeResult,
            },
          };
        }

        return probeResult.data;
      },
      requestMacOsSystemEventsAutomationPermission: async () => {
        const requestResult = await determineMacOsSystemEventsAutomationPermission(true);
        if (!requestResult || requestResult.success !== true || typeof requestResult.data !== 'object') {
          return {
            granted: false,
            reason: typeof requestResult?.error === 'string'
              ? requestResult.error
              : macAutomationCopy.requestFailure,
            details: {
              local_runtime_result: requestResult,
            },
          };
        }

        return requestResult.data;
      },
      emitWorkspaceAccessUpdated: broadcastWorkspaceAccessUpdated,
      emitTraceEvent: appendMainProcessTraceEvent,
      emitAppDiagnosticEvent: appendAppDiagnostic,
      log: console.warn,
    });
  });
}
