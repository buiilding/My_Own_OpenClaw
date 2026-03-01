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
} = require('electron');
const path = require('path');
const { getLatestFrontendConfig, initializeIpc, registerRendererWindow } = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword_bridge.cjs');
const { initializeLocalBackendBridge, stopLocalBackend } = require('./local_backend_bridge.cjs');
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
const { initializeOverlayHandlersRuntime } = require('./overlay_ipc_runtime.cjs');
const {
  getChatWindowBounds: getOverlayChatWindowBounds,
  getResponseWindowBounds: getOverlayResponseWindowBounds,
  getContextLabelWindowBounds: getOverlayContextLabelWindowBounds,
} = require('./overlay_bounds.cjs');
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
  hideChatWindow: hideChatWindowRuntime,
  showChatWindow: showChatWindowRuntime,
  showMainWindow: showMainWindowRuntime,
} = require('./window_visibility_runtime.cjs');
const { createResponseOverlayPhaseEnum } = require('./ipc_overlay_phase_contract.cjs');
let windowManager = null;
try {
  ({ windowManager } = require('node-window-manager'));
} catch (_error) {
  windowManager = null;
}

// Disable hardware acceleration to prevent GPU crashes
app.disableHardwareAcceleration();

// Suppress GPU-related warnings
process.env.LIBGL_ALWAYS_SOFTWARE = '1';
process.env.GALLIUM_DRIVER = 'llvmpipe';

let mainWindow = null;
let chatWindow = null;
let responseWindow = null;
let contextLabelWindow = null;
let overlayHandlersInitialized = false;
let responseOverlayVisible = false;
let responseOverlayPhase = 'idle';
const WAKEWORD_HOTKEY = 'Super+Alt+W';
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
const RESPONSE_WINDOW_DEBUG_VIEW = 'tool-ghost-debug';
const externalFocusTracker = createExternalFocusTracker({
  getPlatform: () => process.platform,
  windowManager,
  appWindowTitleMarkers: APP_WINDOW_TITLE_MARKERS,
  warn: (...args) => console.warn(...args),
});

async function prepareOverlayQueryCaptureFocus(options = {}) {
  const waitMs = typeof options?.waitMs === 'number' ? options.waitMs : 120;
  const skipDemotion = options?.skipDemotion === true;
  return await prepareOverlayQueryCaptureFocusRuntime({
    chatWindow,
    responseWindow,
    mainWindow,
    externalFocusTracker,
    waitMs,
    skipDemotion,
  });
}

function enableContentProtectionSafely(targetWindow, windowLabel) {
  enableContentProtectionSafelyRuntime({
    targetWindow,
    platform: process.platform,
    windowLabel,
    warn: console.warn,
  });
}

function isResponseOverlayStreamingPhase() {
  return isStreamingResponseOverlayPhase(responseOverlayPhase, RESPONSE_OVERLAY_PHASE);
}

const {
  ensureResponseOverlayFallbackBounds,
  positionChatWindow,
  getChatWindowBounds,
  getResponseWindowBounds,
  positionResponseWindow,
  positionContextLabelWindow,
  ensureChatWindowOnTop,
  showResponseWindowInactive,
  showResponseWindowWhenChatVisible,
  syncContextLabelWindowVisibility,
} = createOverlayWindowHelpersRuntime({
  screen,
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

function showChatWindow({ focus = true } = {}) {
  return showChatWindowRuntime({ focus }, {
    chatWindow,
    mainWindow,
    responseWindow,
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

function showMainWindow({ focus = true, maximize = false } = {}) {
  return showMainWindowRuntime({ focus, maximize }, {
    mainWindow,
    chatWindow,
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

function handleResponseOverlayPhaseChange(event = {}) {
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
    ensureResponseOverlayFallbackBounds,
    showResponseWindowWhenChatVisible,
    showResponseWindowInactive,
    syncContextLabelWindowVisibility,
  });
}

function createWindow() {
  mainWindow = createMainWindowRuntime({
    BrowserWindow,
    path,
    app,
    platform: process.platform,
    enableDevTransparencyUi: ENABLE_DEV_TRANSPARENCY_UI,
    initializeIpc,
    handleResponseOverlayPhaseChange,
    prepareOverlayQueryCaptureFocus,
    initializeWakewordBridge,
    showChatWindow,
    emitWakewordSttTrigger,
    initializeLocalBackendBridge,
    initializeOverlayHandlers,
    getLatestFrontendConfig,
    getWindows: () => ({
      mainWindow,
      chatWindow,
      responseWindow,
      contextLabelWindow,
    }),
    setMainWindow: (nextWindow) => {
      mainWindow = nextWindow;
    },
    enableContentProtectionSafely,
  });
}

function createChatWindow() {
  chatWindow = createChatWindowRuntime({
    BrowserWindow,
    path,
    app,
    platform: process.platform,
    enableDevTransparencyUi: ENABLE_DEV_TRANSPARENCY_UI,
    positionChatWindow,
    hideChatWindow,
    syncWakewordToggleForChatVisibility,
    externalFocusTracker,
    setChatWindow: (nextWindow) => {
      chatWindow = nextWindow;
    },
    enableContentProtectionSafely,
  });

  return chatWindow;
}

function createResponseWindow() {
  responseWindow = createResponseWindowRuntime({
    BrowserWindow,
    path,
    app,
    platform: process.platform,
    enableDevTransparencyUi: ENABLE_DEV_TRANSPARENCY_UI,
    enableOsToolGhostDebug: ENABLE_OS_TOOL_GHOST_DEBUG,
    responseWindowDebugView: RESPONSE_WINDOW_DEBUG_VIEW,
    positionResponseWindow,
    showResponseWindowInactive,
    setResponseOverlayVisible: (nextVisible) => {
      responseOverlayVisible = Boolean(nextVisible);
    },
    setResponseOverlayVisibilityState,
    syncContextLabelWindowVisibility,
    setResponseWindow: (nextWindow) => {
      responseWindow = nextWindow;
    },
    enableContentProtectionSafely,
  });

  return responseWindow;
}

function createTray() {
  createTrayRuntime({
    Tray,
    Menu,
    showMainWindow,
    app,
  });
}

initializeMainProcessLifecycleRuntime({
  app,
  BrowserWindow,
  globalShortcut,
  screen,
  registerRendererWindow,
  wakewordHotkey: WAKEWORD_HOTKEY,
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
});

/**
 * Initializes IPC handler for delayed window minimization.
 * Minimizes window after 2 seconds if visible or focused, and not already minimized.
 */
function initializeOverlayHandlers() {
  if (overlayHandlersInitialized) {
    return;
  }
  overlayHandlersInitialized = true;
  initializeOverlayHandlersRuntime({
    ipcMain,
    screen,
    shell,
    systemPreferences,
    platform: process.platform,
    getWindows: () => ({
      mainWindow,
      chatWindow,
      responseWindow,
      contextLabelWindow,
    }),
    getChatWindowBounds,
    positionResponseWindow,
    positionContextLabelWindow,
    syncContextLabelWindowVisibility,
    setChatVisualAnchorHeight,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    showResponseWindowWhenChatVisible,
    showMainWindow,
    showChatWindow,
    hideChatWindow,
    prepareOverlayToolFocus: prepareOverlayQueryCaptureFocus,
    normalizeMainWindowOpenTarget,
    emitMainWindowOpenTarget,
    warn: console.warn,
  });
}
