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
const {
  createPermissionStateStore,
  resolveStatePath: resolvePermissionStatePath,
} = require('./permissions/permission_state_store.cjs');
const {
  getBackendConnectionState,
  getKnownWindieLocalRuntime,
  ensureWindieLocalRuntime,
  getLatestFrontendConfig,
  initializeIpc,
  registerBackendMessageObserver,
  registerRendererWindow,
  appendMainProcessTraceEvent,
  sendAutomatedQuery,
  sendStopQueryToBackend,
  triggerStopQueryFromMain,
  updateGlobalAgentStopShortcutStatus,
} = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword/wakeword_bridge.cjs');
const {
  initializeLocalBackendBridge,
  stopLocalBackend,
  getLocalBackendStatus,
  installBrowserChromium,
  determineMacOsSystemEventsAutomationPermission,
  warmBrowserAutomation,
} = require('./sidecar/local_backend_bridge.cjs');
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
  getContextLabelWindowBounds: getOverlayContextLabelWindowBounds,
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
} = require('./sdk/agent_stop_shortcut_runtime.cjs');
const { createWindowPlatformPolicy } = require('./surfaces/window_platform_policy.cjs');
const { createSurfaceRuntime } = require('./surfaces/surface_runtime.cjs');
const {
  createSdkLiveTurnSurfaceState,
  handleSdkLiveTurnSurfaceIntent,
  resolveOverlayIntent,
} = require('./sdk/sdk_live_turn_surface_controller.cjs');
const {
  createElectronToolSurfaceLifecycle,
} = require('./sdk/tool_surface_lifecycle.cjs');
const {
  readChatPillVisibilityIntent,
  writeChatPillVisibilityIntent,
} = require('./surfaces/chat_pill_visibility_intent_store.cjs');

configureGpuRuntime({ app, env: process.env });

const WAKEWORD_HOTKEY = process.platform === 'win32'
  ? 'CommandOrControl+Alt+W'
  : 'Super+Alt+W';
const MAIN_WINDOW_OPEN_TARGET_CHANNEL = 'main-window-open-target';
const MAIN_WINDOW_OPEN_TARGETS = new Set(['chat', 'memory', 'models', 'onboarding', 'settings']);
const CONTEXT_LABEL_WIDTH = 280;
const CONTEXT_LABEL_HEIGHT = 26;
const CONTEXT_LABEL_OFFSET_X = 14;
const CONTEXT_LABEL_GAP_ABOVE_CHATBOX = -6;
const RESPONSE_OVERLAY_CHAT_GAP = 8;
const CHATBOX_VISUAL_ANCHOR_HEIGHT = 64;
const RESPONSE_OVERLAY_PHASE = createResponseOverlayPhaseEnum();
const ENABLE_OS_TOOL_GHOST_DEBUG = process.env.WINDIE_DEBUG_GHOST_OVERLAY === '1';
const ENABLE_DEV_TRANSPARENCY_UI = process.env.WINDIE_DEV_UI === '1';
const ENABLE_DEBUG_STREAM_TRACE = process.env.WINDIE_DEBUG_STREAM_EVENTS === '1';
const ENABLE_DEBUG_TOOL_SCREENSHOT = process.env.WINDIE_DEBUG_TOOL_SCREENSHOT === '1';
const VM_MODE_ENABLED = isVmModeEnabled(process.env);
const VM_WORKER_MODE_ENABLED = isVmWorkerModeEnabled(process.env);
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
  getOverlayContextLabelWindowBounds,
  contextLabelWidth: CONTEXT_LABEL_WIDTH,
  contextLabelHeight: CONTEXT_LABEL_HEIGHT,
  contextLabelOffsetX: CONTEXT_LABEL_OFFSET_X,
  contextLabelGapAboveChatbox: CONTEXT_LABEL_GAP_ABOVE_CHATBOX,
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
  positionContextLabelWindow,
  positionResponseWindow,
  setManualChatWindowPosition,
  syncContextLabelWindowVisibility,
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
    console.log('[ResponseOverlayWindow][main]', {
      action: 'skip-dismissed-sdk-overlay-intent',
      mode: overlayIntent.mode,
      turn_ref: overlayIntent.turnRef,
      stale_guard_ref: overlayIntent.staleGuardRef,
      conversation_ref: overlayIntent.conversationRef,
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
    syncContextLabelWindowVisibility,
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
  initializeIpc,
  setAgentLoopStopShortcutEnabled: agentStopShortcutRuntime.setEnabled,
  initializeWakewordBridge,
  initializeLocalBackendBridge,
  getKnownLocalRuntime: getKnownWindieLocalRuntime,
  ensureLocalRuntime: ensureWindieLocalRuntime,
  getPermissionStatePath,
  initializeMainProcessIpc,
  createVmWorkerRuntime,
  getBackendConnectionState,
  sendAutomatedQuery,
  sendStopQueryToBackend,
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
  getLatestFrontendConfig,
  positionChatWindow,
  positionResponseWindow,
  showResponseWindowInactive: surfaceRuntime.overlayHelpers.showResponseWindowInactive,
  syncWakewordToggleForChatVisibility: surfaceRuntime.syncWakewordToggleForChatVisibility,
  syncContextLabelWindowVisibility,
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
  stopLocalBackend,
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
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
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

    initializePermissionHandlersRuntime({
      ipcMain,
      shell,
      systemPreferences,
      dialog,
      desktopCapturer,
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
        getLatestFrontendConfig()?.browser_automation_enabled === true
      ),
      verifyBrowserAutomationCapability: async () => {
        const backendStatus = await getLocalBackendStatus();
        if (!backendStatus || backendStatus.success !== true || typeof backendStatus.data !== 'object') {
          return {
            granted: false,
            reason: 'WindieOS local backend is not ready. Wait a moment and retry Enable.',
            details: {
              backend_status: backendStatus,
            },
          };
        }

        const payload = backendStatus.data;
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
              backend_status: payload,
              browser_binary_path: browserBinaryPath,
            },
          };
        }

        const autoInstallEnabled = payload.browser_feature_pack_autoinstall_enabled === true;
        if (hasBrowserTool && featurePackAvailable && !browserBinaryAvailable) {
          return {
            granted: false,
            reason: (
              'Browser automation is enabled, but no compatible Chrome or Chromium browser was found. '
              + 'Click Grant to install Chromium for WindieOS.'
            ),
            details: {
              backend_status: payload,
              missing_browser_binary: true,
              browser_binary_available: false,
            },
          };
        }

        const reason = autoInstallEnabled
          ? 'Browser automation runtime is still unavailable. Retry Enable in a few seconds.'
          : 'Browser automation runtime is unavailable in this build. Reinstall WindieOS or install browser feature pack dependencies.';

        return {
          granted: false,
          reason,
          details: {
            backend_status: payload,
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
              : 'Failed to install Chromium runtime.',
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
              : 'Failed to open the WindieOS browser.',
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
              : 'WindieOS could not verify macOS Automation permission yet.',
            details: {
              backend_result: probeResult,
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
              : 'WindieOS could not request macOS Automation permission.',
            details: {
              backend_result: requestResult,
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
