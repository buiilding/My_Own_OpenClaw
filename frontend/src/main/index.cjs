const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const { getLatestFrontendConfig, initializeIpc, registerRendererWindow } = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword_bridge.cjs');
const { initializeLocalBackendBridge, stopLocalBackend } = require('./local_backend_bridge.cjs');
const { createExternalFocusTracker } = require('./external_focus_tracker.cjs');
const { handleSetAgentSudoAccess } = require('./agent_sudo_access_handler.cjs');
const {
  getChatWindowBounds: getOverlayChatWindowBounds,
  getResponseWindowBounds: getOverlayResponseWindowBounds,
  getContextLabelWindowBounds: getOverlayContextLabelWindowBounds,
} = require('./overlay_bounds.cjs');
const { handleGetDisplays } = require('./display_query_handler.cjs');
const { registerOverlayRendererWindows } = require('./overlay_renderer_registration.cjs');
const {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
} = require('./response_overlay_phase_handler.cjs');
const {
  handleHideChatbox,
  handleShowChatbox,
  handleShowMainWindow,
} = require('./overlay_visibility_handler.cjs');
const {
  handleWindowClose,
  handleWindowMinimize,
  handleWindowToggleMaximize,
} = require('./main_window_controls_handler.cjs');
const { handleSetOverlayIgnoreMouse } = require('./overlay_mouse_handler.cjs');
const { handleMoveChatboxTo, handleSetChatboxSize } = require('./overlay_chatbox_handler.cjs');
const { handleSetResponseboxSize } = require('./overlay_responsebox_handler.cjs');
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
let tray = null;
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
const RESPONSE_OVERLAY_PHASE = Object.freeze({
  IDLE: 'idle',
  AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
  STREAMING: 'streaming',
  TOOL_CALL: 'tool-call',
  TOOL_OUTPUT: 'tool-output',
  COMPLETE: 'complete',
  ERROR: 'error',
});
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

async function prepareOverlayQueryCaptureFocus() {
  if (chatWindow && !chatWindow.isDestroyed() && typeof chatWindow.blur === 'function') {
    chatWindow.blur();
  }
  if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.blur === 'function') {
    mainWindow.blur();
  }
  externalFocusTracker.restorePreviousExternalFocusedWindow();
  await new Promise((resolve) => setTimeout(resolve, 120));
}

function loadRendererView(targetWindow, view) {
  const query = {};
  if (view) {
    query.view = view;
  }
  if (ENABLE_DEV_TRANSPARENCY_UI) {
    query.dev_ui = '1';
  }

  if (app.isPackaged) {
    const rendererEntryFile = path.join(__dirname, '../../dist/index.html');
    targetWindow.loadFile(
      rendererEntryFile,
      Object.keys(query).length > 0 ? { query } : undefined,
    );
    return;
  }

  const devUrl = 'http://localhost:5173';
  const queryString = new URLSearchParams(query).toString();
  if (queryString) {
    targetWindow.loadURL(`${devUrl}?${queryString}`);
  } else {
    targetWindow.loadURL(devUrl);
  }
}

function createOverlayBrowserWindow({ width, height, show }) {
  const windowOptions = {
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Use CSS shadow for overlay windows; WM shadows are often rectangular on Linux.
    hasShadow: false,
    // Hint to Linux compositors that this is a small utility window.
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (typeof show === 'boolean') {
    windowOptions.show = show;
  }
  return new BrowserWindow(windowOptions);
}

function enableContentProtectionSafely(targetWindow, windowLabel) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return;
  }
  try {
    targetWindow.setContentProtection(true);
  } catch (error) {
    console.warn(
      `[Main] Failed to enable ${windowLabel} content protection:`,
      error?.message || error
    );
  }
}

function isResponseOverlayStreamingPhase() {
  return isStreamingResponseOverlayPhase(responseOverlayPhase, RESPONSE_OVERLAY_PHASE);
}

function ensureResponseOverlayFallbackBounds() {
  if (!responseWindow || responseWindow.isDestroyed()) {
    return;
  }
  const defaultWidth = chatWindow && !chatWindow.isDestroyed()
    ? chatWindow.getSize()[0]
    : 520;
  const [currentWidth, currentHeight] = responseWindow.getSize();
  const width = Math.max(1, currentWidth || defaultWidth);
  const height = Math.max(42, currentHeight || 0);
  const bounds = getResponseWindowBounds(width, height);
  responseWindow.setBounds(bounds, false);
}

function positionChatWindow() {
  if (!chatWindow) {
    return;
  }
  const [width, height] = chatWindow.getSize();
  const { x, y } = getChatWindowBounds(width, height);
  chatWindow.setPosition(x, y, false);
  positionResponseWindow();
  positionContextLabelWindow();
}

function getChatWindowBounds(width, height) {
  return getOverlayChatWindowBounds({ screen, width, height });
}

function getResponseWindowBounds(width, height) {
  const chatBounds = chatWindow && !chatWindow.isDestroyed()
    ? chatWindow.getBounds()
    : null;
  return getOverlayResponseWindowBounds({
    screen,
    width,
    height,
    chatBounds,
  });
}

function getContextLabelWindowBounds() {
  const chatBounds = chatWindow && !chatWindow.isDestroyed()
    ? chatWindow.getBounds()
    : null;
  return getOverlayContextLabelWindowBounds({
    screen,
    chatBounds,
    labelWidth: CONTEXT_LABEL_WIDTH,
    labelHeight: CONTEXT_LABEL_HEIGHT,
    offsetX: CONTEXT_LABEL_OFFSET_X,
    gapAbove: CONTEXT_LABEL_GAP_ABOVE_CHATBOX,
  });
}

function positionResponseWindow() {
  if (!responseWindow || responseWindow.isDestroyed() || !responseOverlayVisible) {
    return;
  }
  const [width, height] = responseWindow.getSize();
  const bounds = getResponseWindowBounds(width, height);
  responseWindow.setBounds(bounds, false);
}

function positionContextLabelWindow() {
  if (!contextLabelWindow || contextLabelWindow.isDestroyed()) {
    return;
  }
  const bounds = getContextLabelWindowBounds();
  contextLabelWindow.setBounds(bounds, false);
}

function ensureChatWindowOnTop() {
  if (!chatWindow || chatWindow.isDestroyed()) {
    return;
  }
  try {
    chatWindow.setAlwaysOnTop(true, 'floating');
    if (typeof chatWindow.moveTop === 'function') {
      chatWindow.moveTop();
    }
  } catch (error) {
    console.warn('[Main] Failed to keep chatbox on top:', error?.message || error);
  }
}

function ensureResponseWindowOnTop() {
  if (!responseWindow || responseWindow.isDestroyed() || !responseOverlayVisible) {
    return;
  }
  try {
    responseWindow.setAlwaysOnTop(true, 'floating');
    if (typeof responseWindow.moveTop === 'function') {
      responseWindow.moveTop();
    }
  } catch (error) {
    console.warn('[Main] Failed to keep response overlay on top:', error?.message || error);
  }
}

function ensureContextLabelWindowOnTop() {
  if (!contextLabelWindow || contextLabelWindow.isDestroyed() || !contextLabelWindow.isVisible()) {
    return;
  }
  try {
    contextLabelWindow.setAlwaysOnTop(true, 'floating');
    if (typeof contextLabelWindow.moveTop === 'function') {
      contextLabelWindow.moveTop();
    }
  } catch (error) {
    console.warn('[Main] Failed to keep context label on top:', error?.message || error);
  }
}

function showResponseWindowInactive() {
  if (!responseWindow || responseWindow.isDestroyed()) {
    return;
  }
  if (typeof responseWindow.showInactive === 'function') {
    responseWindow.showInactive();
  } else {
    responseWindow.show();
  }
  ensureResponseWindowOnTop();
}

function showResponseWindowWhenChatVisible() {
  if (!chatWindow || chatWindow.isDestroyed() || !chatWindow.isVisible()) {
    return;
  }
  showResponseWindowInactive();
}

function showContextLabelWindowInactive() {
  if (!contextLabelWindow || contextLabelWindow.isDestroyed()) {
    return;
  }
  positionContextLabelWindow();
  if (typeof contextLabelWindow.showInactive === 'function') {
    contextLabelWindow.showInactive();
  } else {
    contextLabelWindow.show();
  }
  ensureContextLabelWindowOnTop();
}

function syncContextLabelWindowVisibility() {
  if (!contextLabelWindow || contextLabelWindow.isDestroyed()) {
    return;
  }
  const shouldShow = Boolean(
    chatWindow
      && !chatWindow.isDestroyed()
      && chatWindow.isVisible()
      && !responseOverlayVisible,
  );

  if (!shouldShow) {
    if (contextLabelWindow.isVisible()) {
      contextLabelWindow.hide();
    }
    return;
  }
  showContextLabelWindowInactive();
}

function sendWakewordToggle(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('wakeword-toggle', { enabled: Boolean(enabled) });
}

function syncWakewordToggleForChatVisibility() {
  const isChatVisible = Boolean(
    chatWindow
      && !chatWindow.isDestroyed()
      && chatWindow.isVisible(),
  );
  sendWakewordToggle(!isChatVisible);
}

function emitWakewordSttTrigger() {
  if (!chatWindow || chatWindow.isDestroyed() || !chatWindow.webContents) {
    return;
  }
  chatWindow.webContents.send(WAKEWORD_STT_TRIGGER_CHANNEL, { source: 'wakeword' });
}

function broadcastResponseOverlayVisibility(visible = responseOverlayVisible) {
  const payload = { visible: Boolean(visible) };
  const rendererWindows = [mainWindow, chatWindow, responseWindow, contextLabelWindow];
  for (const win of rendererWindows) {
    if (!win || win.isDestroyed() || !win.webContents) {
      continue;
    }
    win.webContents.send('response-overlay-visibility', payload);
  }
}

function setResponseOverlayVisibilityState(visible) {
  responseOverlayVisible = Boolean(visible);
  broadcastResponseOverlayVisibility(responseOverlayVisible);
  syncContextLabelWindowVisibility();
}

function showChatWindow({ focus = true } = {}) {
  if (!chatWindow || chatWindow.isDestroyed()) {
    return { success: false, reason: 'Chat window not available' };
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }
  if (!chatWindow.isVisible()) {
    chatWindow.show();
  }
  ensureChatWindowOnTop();
  const shouldRestoreResponse = responseOverlayVisible || isResponseOverlayStreamingPhase();
  if (responseWindow && !responseWindow.isDestroyed() && shouldRestoreResponse) {
    if (isResponseOverlayStreamingPhase()) {
      responseOverlayVisible = true;
      ensureResponseOverlayFallbackBounds();
    }
    showResponseWindowInactive();
  }
  const responseIsVisible = Boolean(
    responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible(),
  );
  broadcastResponseOverlayVisibility(responseIsVisible);
  syncContextLabelWindowVisibility();
  if (focus) {
    externalFocusTracker.capturePreviousExternalFocusedWindow();
    chatWindow.focus();
    chatWindow.webContents.send('chatbox-focus');
  }
  syncWakewordToggleForChatVisibility();
  return { success: true };
}

function hideChatWindow() {
  if (!chatWindow || chatWindow.isDestroyed()) {
    return { success: false, reason: 'Chat window not available' };
  }
  if (chatWindow.isVisible()) {
    chatWindow.hide();
  }
  if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
    responseWindow.hide();
  }
  if (contextLabelWindow && !contextLabelWindow.isDestroyed() && contextLabelWindow.isVisible()) {
    contextLabelWindow.hide();
  }
  broadcastResponseOverlayVisibility(false);
  syncWakewordToggleForChatVisibility();
  return { success: true };
}

function showMainWindow({ focus = true, maximize = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, reason: 'Main window not available' };
  }
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
    hideChatWindow();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (maximize) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isMaximized()) {
      mainWindow.maximize();
    }
  }
  if (focus) {
    mainWindow.focus();
  }
  return { success: true };
}

function normalizeMainWindowOpenTarget(options = {}) {
  if (!options || typeof options !== 'object') {
    return null;
  }
  const openTarget = typeof options.open === 'string' ? options.open.trim().toLowerCase() : '';
  if (!MAIN_WINDOW_OPEN_TARGETS.has(openTarget)) {
    return null;
  }
  return openTarget;
}

function emitMainWindowOpenTarget(target) {
  if (!target || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(MAIN_WINDOW_OPEN_TARGET_CHANNEL, {
    target,
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
  mainWindow = new BrowserWindow({
    width: 1000, // Increased width to accommodate sidebar
    height: 700,
    show: false,
    frame: false,
    backgroundColor: '#111318',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Optional: Hide from taskbar when minimized to tray
    // skipTaskbar: true,
  });

  enableContentProtectionSafely(mainWindow, 'main window');

  loadRendererView(mainWindow);
  // mainWindow.webContents.openDevTools();

  initializeIpc(mainWindow, {
    onResponseOverlayPhaseChange: handleResponseOverlayPhaseChange,
    onBeforeOverlayQueryCapture: prepareOverlayQueryCaptureFocus,
  });
  initializeWakewordBridge(mainWindow, () => {
    const result = showChatWindow({ focus: true });
    if (result?.success) {
      emitWakewordSttTrigger();
    }
  });
  initializeLocalBackendBridge(() => ({
    mainWindow,
    chatWindow,
    responseWindow,
    contextLabelWindow,
  }), {
    getFrontendConfig: getLatestFrontendConfig,
  });
  initializeOverlayHandlers();

  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  // Instead of quitting, hide the window to the tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showChatWindow({ focus: true });
    }
    return false;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createChatWindow() {
  chatWindow = createOverlayBrowserWindow({ width: 520, height: 96 });
  enableContentProtectionSafely(chatWindow, 'chat box');

  chatWindow.setAlwaysOnTop(true, 'floating');
  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  chatWindow.setIgnoreMouseEvents(false);
  positionChatWindow();

  loadRendererView(chatWindow, 'chatbox');

  chatWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      hideChatWindow();
    }
    return false;
  });

  chatWindow.on('closed', () => {
    chatWindow = null;
  });

  chatWindow.on('show', () => {
    syncWakewordToggleForChatVisibility();
  });

  chatWindow.on('hide', () => {
    syncWakewordToggleForChatVisibility();
  });

  return chatWindow;
}

function createResponseWindow() {
  responseWindow = createOverlayBrowserWindow({
    width: 520,
    height: ENABLE_OS_TOOL_GHOST_DEBUG ? 620 : 1,
    show: ENABLE_OS_TOOL_GHOST_DEBUG,
  });
  enableContentProtectionSafely(responseWindow, 'response overlay');

  responseWindow.setAlwaysOnTop(true, 'floating');
  responseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  loadRendererView(
    responseWindow,
    ENABLE_OS_TOOL_GHOST_DEBUG ? RESPONSE_WINDOW_DEBUG_VIEW : 'chatbox-response',
  );

  if (ENABLE_OS_TOOL_GHOST_DEBUG) {
    responseOverlayVisible = true;
    positionResponseWindow();
    showResponseWindowInactive();
  }

  responseWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      responseOverlayVisible = false;
      responseWindow.hide();
      broadcastResponseOverlayVisibility(false);
      syncContextLabelWindowVisibility();
    }
    return false;
  });

  responseWindow.on('closed', () => {
    responseWindow = null;
    responseOverlayVisible = false;
    broadcastResponseOverlayVisibility(false);
    syncContextLabelWindowVisibility();
  });

  return responseWindow;
}

function createTray() {
  // Create a transparent 1x1 pixel icon to use as a placeholder.
  // TODO: Replace with a proper app icon later.
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  );
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        showMainWindow({ focus: true });
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Desktop Assistant');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    showMainWindow({ focus: true });
  });
}

app.whenReady().then(() => {
  createWindow();
  createChatWindow();
  createResponseWindow();
  createTray();
  syncWakewordToggleForChatVisibility();

  registerOverlayRendererWindows(
    [chatWindow, responseWindow],
    { registerRendererWindow },
  );

  screen.on('display-metrics-changed', () => {
    positionChatWindow();
    positionResponseWindow();
  });

  const registered = globalShortcut.register(WAKEWORD_HOTKEY, () => {
    if (!chatWindow || chatWindow.isDestroyed()) {
      return;
    }
    if (chatWindow.isVisible()) {
      hideChatWindow();
    } else {
      showChatWindow({ focus: true });
    }
  });

  if (!registered) {
    console.warn(`[Main] Failed to register global shortcut: ${WAKEWORD_HOTKEY}`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      const chatOverlay = createChatWindow();
      const responseOverlay = createResponseWindow();
      registerOverlayRendererWindows(
        [chatOverlay, responseOverlay],
        { registerRendererWindow },
      );
    } else {
      showMainWindow({ focus: true });
    }
  });
});

// Handle app quit to cleanup subprocesses
app.on('before-quit', () => {
  app.isQuitting = true;
  console.log('[Main] App quitting, cleaning up subprocesses...');
  stopLocalBackend();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Prevent app from quitting when all windows are closed.
// The app will continue to run in the system tray.
app.on('window-all-closed', (e) => {
  e.preventDefault();
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
  ipcMain.handle('set-overlay-ignore-mouse', async (event, { ignore } = {}) => {
    return handleSetOverlayIgnoreMouse({ ignore }, {
      chatWindow,
      responseWindow,
      contextLabelWindow,
    });
  });

  ipcMain.handle('set-chatbox-size', async (event, args = {}) => {
    return handleSetChatboxSize(args, {
      chatWindow,
      getChatWindowBounds,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
    });
  });

  ipcMain.on('move-chatbox-to', (event, { x, y } = {}) => {
    handleMoveChatboxTo({ x, y }, {
      chatWindow,
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      warn: console.warn,
    });
  });

  ipcMain.handle('set-responsebox-size', async (event, args = {}) => {
    return handleSetResponseboxSize(args, {
      responseWindow,
      chatWindow,
      screen,
      getResponseWindowBounds,
      setResponseOverlayVisibilityState,
      showResponseWindowWhenChatVisible,
    });
  });

  ipcMain.handle('show-main-window', async (event, options = {}) => {
    const result = handleShowMainWindow(options, { showMainWindow });
    const target = normalizeMainWindowOpenTarget(options);
    if (result?.success && target) {
      emitMainWindowOpenTarget(target);
    }
    return result;
  });

  ipcMain.handle('show-chatbox', async (event, options = {}) => {
    return handleShowChatbox(options, { showChatWindow });
  });

  ipcMain.handle('hide-chatbox', async () => {
    return handleHideChatbox({ hideChatWindow });
  });

  ipcMain.handle('get-displays', async () => {
    return handleGetDisplays({ screen });
  });

  ipcMain.handle('window-minimize', async () => {
    return handleWindowMinimize({ mainWindow });
  });

  ipcMain.handle('window-toggle-maximize', async () => {
    return handleWindowToggleMaximize({ mainWindow });
  });

  ipcMain.handle('window-close', async () => {
    return handleWindowClose({ mainWindow });
  });

  ipcMain.handle('set-agent-sudo-access', async (event, options = {}) => {
    return await handleSetAgentSudoAccess(options, {
      platform: process.platform,
      username: os.userInfo()?.username,
    });
  });
}
