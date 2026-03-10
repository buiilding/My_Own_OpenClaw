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
  getBackendConnectionState,
  getLatestFrontendConfig,
  initializeIpc,
  registerBackendMessageObserver,
  registerRendererWindow,
  sendAutomatedQuery,
  sendMessageToBackend,
  triggerStopQueryFromMain,
} = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword_bridge.cjs');
const {
  initializeLocalBackendBridge,
  stopLocalBackend,
  getLocalBackendStatus,
  installBrowserChromium,
} = require('./local_backend_bridge.cjs');
const { createVmWorkerRuntime } = require('./vm_worker_runtime.cjs');
const { createExternalFocusTracker } = require('./external_focus_tracker.cjs');
const {
  createChatWindow: createChatWindowRuntime,
  createMainWindow: createMainWindowRuntime,
  createResponseWindow: createResponseWindowRuntime,
  createTray: createTrayRuntime,
  emitMainWindowOpenTarget: emitMainWindowOpenTargetRuntime,
  enableContentProtectionSafely: enableContentProtectionSafelyRuntime,
  normalizeMainWindowOpenTarget: normalizeMainWindowOpenTargetRuntime,
  prepareOverlayQueryCaptureFocus: prepareOverlayQueryCaptureFocusRuntime,
} = require('./main_window_runtime.cjs');
const {
  initializeMainProcessLifecycleRuntime,
} = require('./main_process_lifecycle_runtime.cjs');
const {
  createWindowBootstrapRuntime,
} = require('./main_process_bootstrap_runtime.cjs');
const { initializeOverlayPhaseHandlersRuntime } = require('./overlay_phase_ipc_runtime.cjs');
const { initializeWindowControlHandlersRuntime } = require('./window_controls_ipc_runtime.cjs');
const { initializePermissionHandlersRuntime } = require('./permission_ipc_runtime.cjs');
const {
  getChatWindowBounds: getOverlayChatWindowBounds,
  getResponseWindowBounds: getOverlayResponseWindowBounds,
  getContextLabelWindowBounds: getOverlayContextLabelWindowBounds,
} = require('./overlay_bounds.cjs');
const {
  getActiveDisplayAffinity: getActiveDisplayAffinityRuntime,
  setActiveDisplayAffinity: setActiveDisplayAffinityRuntime,
  syncActiveDisplayAffinityForWindow: syncActiveDisplayAffinityForWindowRuntime,
} = require('./display_affinity_runtime.cjs');
const { createOverlayWindowHelpersRuntime } = require('./overlay_window_helpers_runtime.cjs');
const {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
} = require('./response_overlay_phase_handler.cjs');
const {
  broadcastResponseOverlayVisibility: broadcastResponseOverlayVisibilityRuntime,
  emitWakewordSttTrigger: emitWakewordSttTriggerRuntime,
  setResponseOverlayVisibilityState: setResponseOverlayVisibilityStateRuntime,
  syncWakewordToggleForChatVisibility: syncWakewordToggleForChatVisibilityRuntime,
} = require('./overlay_signal_runtime.cjs');
const {
  hideMainWindow: hideMainWindowRuntime,
  hideChatWindow: hideChatWindowRuntime,
  showChatWindow: showChatWindowRuntime,
  showMainWindow: showMainWindowRuntime,
} = require('./window_visibility_runtime.cjs');
const {
  normalizeChatSurfaceWindowOptions,
  normalizeMainSurfaceWindowOptions,
} = require('./surface_window_options_runtime.cjs');
const { createResponseOverlayPhaseEnum } = require('./ipc/ipc_overlay_phase_contract.cjs');
const { configureGpuRuntime } = require('./gpu_runtime.cjs');
const { isVmModeEnabled, isVmWorkerModeEnabled } = require('./runtime_mode.cjs');
const {
  initializeAgentStopShortcutRuntime,
  resolveGlobalAgentStopAccelerator,
} = require('./agent_stop_shortcut_runtime.cjs');
let windowManager = null;
try {
  ({ windowManager } = require('node-window-manager'));
} catch (_error) {
  windowManager = null;
}

configureGpuRuntime({ app, env: process.env });

let mainWindow = null;
let chatWindow = null;
let responseWindow = null;
let contextLabelWindow = null;
let mainProcessIpcHandlersInitialized = false;
let responseOverlayVisible = false;
let responseOverlayPhase = 'idle';
const WAKEWORD_HOTKEY = process.platform === 'win32'
  ? 'CommandOrControl+Alt+W'
  : 'Super+Alt+W';
const WAKEWORD_STT_TRIGGER_CHANNEL = 'wakeword-stt-trigger';
const MAIN_WINDOW_OPEN_TARGET_CHANNEL = 'main-window-open-target';
const MAIN_WINDOW_OPEN_TARGETS = new Set(['chat', 'memory', 'models', 'settings']);
const CONTEXT_LABEL_WIDTH = 280;
const CONTEXT_LABEL_HEIGHT = 26;
const CONTEXT_LABEL_OFFSET_X = 14;
const CONTEXT_LABEL_GAP_ABOVE_CHATBOX = -6;
const RESPONSE_OVERLAY_CHAT_GAP = 2;
const CHATBOX_VISUAL_ANCHOR_HEIGHT = 64;
let chatVisualAnchorHeight = CHATBOX_VISUAL_ANCHOR_HEIGHT;
const RESPONSE_OVERLAY_PHASE = createResponseOverlayPhaseEnum();
const APP_WINDOW_TITLE_MARKERS = ['desktop assistant', 'windieos'];
const ENABLE_OS_TOOL_GHOST_DEBUG = process.env.WINDIE_DEBUG_GHOST_OVERLAY === '1';
const ENABLE_DEV_TRANSPARENCY_UI = process.env.WINDIE_DEV_UI === '1';
const ENABLE_DEBUG_STREAM_TRACE = process.env.WINDIE_DEBUG_STREAM_EVENTS === '1';
const ENABLE_DEBUG_TOOL_SCREENSHOT = process.env.WINDIE_DEBUG_TOOL_SCREENSHOT === '1';
const VM_MODE_ENABLED = isVmModeEnabled(process.env);
const VM_WORKER_MODE_ENABLED = isVmWorkerModeEnabled(process.env);
const RESPONSE_WINDOW_DEBUG_VIEW = 'tool-ghost-debug';
const GLOBAL_AGENT_STOP_ACCELERATOR = resolveGlobalAgentStopAccelerator(process.platform);
let vmWorkerRuntime = null;
const agentStopShortcutRuntime = initializeAgentStopShortcutRuntime({
  globalShortcut,
  accelerator: GLOBAL_AGENT_STOP_ACCELERATOR,
  onStop: () => {
    triggerStopQueryFromMain();
  },
  warn: console.warn,
});
const externalFocusTracker = createExternalFocusTracker({
  getPlatform: () => process.platform,
  windowManager,
  appWindowTitleMarkers: APP_WINDOW_TITLE_MARKERS,
  warn: (...args) => console.warn(...args),
});

function syncWindowDisplayAffinity(targetWindow) {
  return syncActiveDisplayAffinityForWindowRuntime(screen, targetWindow);
}

async function prepareOverlayQueryCaptureFocus(options = {}) {
  const waitMs = typeof options?.waitMs === 'number' ? options.waitMs : 120;
  return await prepareOverlayQueryCaptureFocusRuntime({
    chatWindow,
    responseWindow,
    mainWindow,
    waitMs,
  });
}

function enableContentProtectionSafely(targetWindowOrOptions, windowLabel) {
  const options = (
    targetWindowOrOptions
    && typeof targetWindowOrOptions === 'object'
    && !Array.isArray(targetWindowOrOptions)
    && Object.prototype.hasOwnProperty.call(targetWindowOrOptions, 'targetWindow')
  )
    ? targetWindowOrOptions
    : { targetWindow: targetWindowOrOptions, windowLabel };

  enableContentProtectionSafelyRuntime({
    ...options,
    platform: process.platform,
    warn: console.warn,
  });
}

function isResponseOverlayStreamingPhase() {
  return isStreamingResponseOverlayPhase(responseOverlayPhase, RESPONSE_OVERLAY_PHASE);
}

const {
  ensureResponseOverlayFallbackBounds,
  positionChatWindow,
  setManualChatWindowPosition,
  getResponseWindowBounds,
  positionResponseWindow,
  positionContextLabelWindow,
  ensureChatWindowOnTop,
  showResponseWindowInactive,
  showResponseWindowWhenChatVisible,
  syncContextLabelWindowVisibility,
} = createOverlayWindowHelpersRuntime({
  screen,
  getActiveDisplayAffinity: getActiveDisplayAffinityRuntime,
  getChatWindow: () => chatWindow,
  getResponseWindow: () => responseWindow,
  getContextLabelWindow: () => contextLabelWindow,
  getResponseOverlayVisible: () => responseOverlayVisible,
  getOverlayChatWindowBounds,
  getOverlayResponseWindowBounds,
  getOverlayContextLabelWindowBounds,
  contextLabelWidth: CONTEXT_LABEL_WIDTH,
  contextLabelHeight: CONTEXT_LABEL_HEIGHT,
  contextLabelOffsetX: CONTEXT_LABEL_OFFSET_X,
  contextLabelGapAboveChatbox: CONTEXT_LABEL_GAP_ABOVE_CHATBOX,
  responseGap: RESPONSE_OVERLAY_CHAT_GAP,
  getChatVisualAnchorHeight: () => chatVisualAnchorHeight,
  warn: console.warn,
});

function setChatVisualAnchorHeight(height) {
  const nextHeight = Math.round(Number(height));
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
    return false;
  }
  if (nextHeight === chatVisualAnchorHeight) {
    return false;
  }
  chatVisualAnchorHeight = nextHeight;
  return true;
}

function syncWakewordToggleForChatVisibility() {
  syncWakewordToggleForChatVisibilityRuntime({
    mainWindow,
    chatWindow,
  });
}

function emitWakewordSttTrigger() {
  emitWakewordSttTriggerRuntime({
    chatWindow,
    channel: WAKEWORD_STT_TRIGGER_CHANNEL,
  });
}

function broadcastResponseOverlayVisibility(visible = responseOverlayVisible) {
  broadcastResponseOverlayVisibilityRuntime({
    visible,
    windows: [mainWindow, chatWindow, responseWindow, contextLabelWindow],
  });
}

function setResponseOverlayVisibilityState(visible) {
  setResponseOverlayVisibilityStateRuntime(visible, {
    setResponseOverlayVisible: (nextVisible) => {
      responseOverlayVisible = Boolean(nextVisible);
    },
    broadcastResponseOverlayVisibility,
    syncContextLabelWindowVisibility,
  });
}

function showChatWindow(options = {}) {
  return showChatWindowRuntime(normalizeChatSurfaceWindowOptions(options), {
    chatWindow,
    mainWindow,
    responseWindow,
    positionChatWindow,
    responseOverlayVisible,
    isResponseOverlayStreamingPhase,
    setResponseOverlayVisible: (nextVisible) => {
      responseOverlayVisible = Boolean(nextVisible);
    },
    ensureChatWindowOnTop,
    ensureResponseOverlayFallbackBounds,
    showResponseWindowInactive,
    broadcastResponseOverlayVisibility,
    syncContextLabelWindowVisibility,
    syncWakewordToggleForChatVisibility,
    syncWindowDisplayAffinity,
    setActiveDisplayAffinity: setActiveDisplayAffinityRuntime,
    getActiveDisplayAffinity: getActiveDisplayAffinityRuntime,
    externalFocusTracker,
  });
}

function hideChatWindow() {
  return hideChatWindowRuntime({
    chatWindow,
    responseWindow,
    contextLabelWindow,
    broadcastResponseOverlayVisibility,
    syncWakewordToggleForChatVisibility,
  });
}

async function hideMainWindow(options = {}) {
  return await hideMainWindowRuntime(options, {
    mainWindow,
  });
}

function showMainWindow(options = {}) {
  return showMainWindowRuntime(normalizeMainSurfaceWindowOptions(options), {
    mainWindow,
    chatWindow,
    syncWindowDisplayAffinity,
    setActiveDisplayAffinity: setActiveDisplayAffinityRuntime,
    getActiveDisplayAffinity: getActiveDisplayAffinityRuntime,
    hideChatWindow,
  });
}

function normalizeMainWindowOpenTarget(options = {}) {
  return normalizeMainWindowOpenTargetRuntime({
    options,
    allowedTargets: MAIN_WINDOW_OPEN_TARGETS,
  });
}

function emitMainWindowOpenTarget(target) {
  emitMainWindowOpenTargetRuntime({
    target,
    mainWindow,
    channel: MAIN_WINDOW_OPEN_TARGET_CHANNEL,
  });
}

function applyResponseOverlayPhase(event = {}) {
  handleResponseOverlayPhaseEvent(event, {
    ENABLE_OS_TOOL_GHOST_DEBUG,
    RESPONSE_OVERLAY_PHASE,
    setResponseOverlayPhase: (nextPhase) => {
      responseOverlayPhase = nextPhase;
    },
    getResponseOverlayVisible: () => responseOverlayVisible,
    setResponseOverlayVisibilityState,
    responseWindow,
    chatWindow,
    contextLabelWindow,
    ensureResponseOverlayFallbackBounds,
    showResponseWindowWhenChatVisible,
    showResponseWindowInactive,
    syncContextLabelWindowVisibility,
    warn: console.warn,
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
  initializeMainProcessIpc,
  createVmWorkerRuntime,
  getBackendConnectionState,
  sendAutomatedQuery,
  sendMessageToBackend,
  registerBackendMessageObserver,
  createMainWindowRuntime,
  createChatWindowRuntime,
  createResponseWindowRuntime,
  createTrayRuntime,
  prepareOverlayQueryCaptureFocus,
  showChatWindow,
  hideChatWindow,
  showMainWindow,
  emitWakewordSttTrigger,
  getLatestFrontendConfig,
  positionChatWindow,
  positionResponseWindow,
  showResponseWindowInactive,
  syncWakewordToggleForChatVisibility,
  syncContextLabelWindowVisibility,
  setResponseOverlayVisibilityState,
  enableContentProtectionSafely,
  syncWindowDisplayAffinity,
  externalFocusTracker,
  getState: () => ({
    windows: {
      mainWindow,
      chatWindow,
      responseWindow,
      contextLabelWindow,
    },
    vmWorkerRuntime,
    applyResponseOverlayPhase,
    setResponseOverlayVisible: (nextVisible) => {
      responseOverlayVisible = Boolean(nextVisible);
    },
  }),
  setMainWindow: (nextWindow) => {
    mainWindow = nextWindow;
  },
  setChatWindow: (nextWindow) => {
    chatWindow = nextWindow;
  },
  setResponseWindow: (nextWindow) => {
    responseWindow = nextWindow;
  },
  setVmWorkerRuntime: (nextRuntime) => {
    vmWorkerRuntime = nextRuntime;
  },
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
});

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
  syncWakewordToggleForChatVisibility,
  positionChatWindow,
  positionResponseWindow,
  hideChatWindow,
  showChatWindow,
  showMainWindow,
  getChatWindow: () => chatWindow,
  getResponseWindow: () => responseWindow,
  stopLocalBackend,
  stopVmWorker: () => {
    if (vmWorkerRuntime) {
      vmWorkerRuntime.stop();
      vmWorkerRuntime = null;
    }
  },
});

function initializeMainProcessIpc() {
  if (mainProcessIpcHandlersInitialized) {
    return;
  }
  mainProcessIpcHandlersInitialized = true;

  const getWindows = () => ({
    mainWindow,
    chatWindow,
    responseWindow,
    contextLabelWindow,
  });

  initializeOverlayPhaseHandlersRuntime({
    ipcMain,
    BrowserWindow,
    screen,
    getWindows,
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
    syncWindowDisplayAffinity,
    setManualChatWindowPosition,
    setChatVisualAnchorHeight,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    showResponseWindowWhenChatVisible,
    showMainWindow,
    showChatWindow,
    hideChatWindow,
    hideMainWindow,
    warn: console.warn,
  });

  initializeWindowControlHandlersRuntime({
    ipcMain,
    BrowserWindow,
    screen,
    getWindows,
    showMainWindow,
    normalizeMainWindowOpenTarget,
    emitMainWindowOpenTarget,
  });

  initializePermissionHandlersRuntime({
    ipcMain,
    shell,
    systemPreferences,
    dialog,
    desktopCapturer,
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    focusPermissionPromptWindow: async () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return {
          success: false,
          reason: 'Main window is unavailable.',
        };
      }

      try {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
        mainWindow.moveTop();
        mainWindow.focus();
        mainWindow.webContents?.focus();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          reason: error?.message || String(error),
        };
      }
    },
    requestRendererMicrophoneAccess: async () => {
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
  });
}
