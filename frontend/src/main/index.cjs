const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const { initializeIpc, registerRendererWindow } = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword_bridge.cjs');
const { initializeLocalBackendBridge, stopLocalBackend } = require('./local_backend_bridge.cjs');
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
let lastExternalFocusedWindowId = null;
let lastExternalFocusedWindowTitle = null;
const WAKEWORD_HOTKEY = 'Super+Alt+W';
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
const RESPONSE_WINDOW_DEBUG_VIEW = 'tool-ghost-debug';

function isAppWindowTitle(title) {
  const normalized = String(title || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return APP_WINDOW_TITLE_MARKERS.some((marker) => normalized.includes(marker));
}

function capturePreviousExternalFocusedWindow() {
  if (process.platform !== 'win32' || !windowManager || typeof windowManager.getActiveWindow !== 'function') {
    return;
  }
  try {
    const activeWindow = windowManager.getActiveWindow();
    if (!activeWindow) {
      return;
    }
    const activeTitle = typeof activeWindow.getTitle === 'function'
      ? activeWindow.getTitle()
      : '';
    if (!activeTitle || isAppWindowTitle(activeTitle)) {
      return;
    }
    if (typeof activeWindow.id === 'number') {
      lastExternalFocusedWindowId = activeWindow.id;
    }
    lastExternalFocusedWindowTitle = activeTitle;
  } catch (error) {
    console.warn('[Main] Failed to snapshot external focused window:', error?.message || error);
  }
}

function restorePreviousExternalFocusedWindow() {
  if (process.platform !== 'win32' || !windowManager || typeof windowManager.getWindows !== 'function') {
    return false;
  }
  try {
    const windows = windowManager.getWindows();
    if (!Array.isArray(windows) || windows.length === 0) {
      return false;
    }
    let target = null;
    if (typeof lastExternalFocusedWindowId === 'number') {
      target = windows.find((win) => win && win.id === lastExternalFocusedWindowId) || null;
    }
    if (!target && lastExternalFocusedWindowTitle) {
      target = windows.find((win) => (
        win
        && typeof win.getTitle === 'function'
        && win.getTitle() === lastExternalFocusedWindowTitle
      )) || null;
    }
    if (!target || typeof target.bringToTop !== 'function') {
      return false;
    }
    target.bringToTop();
    return true;
  } catch (error) {
    console.warn('[Main] Failed to restore external focused window:', error?.message || error);
    return false;
  }
}

async function prepareOverlayQueryCaptureFocus() {
  if (chatWindow && !chatWindow.isDestroyed() && typeof chatWindow.blur === 'function') {
    chatWindow.blur();
  }
  if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.blur === 'function') {
    mainWindow.blur();
  }
  restorePreviousExternalFocusedWindow();
  await new Promise((resolve) => setTimeout(resolve, 120));
}

function loadRendererView(targetWindow, view) {
  if (app.isPackaged) {
    const rendererEntryFile = path.join(__dirname, '../../dist/index.html');
    if (view) {
      targetWindow.loadFile(rendererEntryFile, { query: { view } });
      return;
    }
    targetWindow.loadFile(rendererEntryFile);
    return;
  }

  const devUrl = 'http://localhost:5173';
  if (view) {
    targetWindow.loadURL(`${devUrl}?view=${encodeURIComponent(view)}`);
    return;
  }
  targetWindow.loadURL(devUrl);
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
  return (
    responseOverlayPhase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK
    || responseOverlayPhase === RESPONSE_OVERLAY_PHASE.STREAMING
    || responseOverlayPhase === RESPONSE_OVERLAY_PHASE.TOOL_CALL
    || responseOverlayPhase === RESPONSE_OVERLAY_PHASE.TOOL_OUTPUT
  );
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
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const marginBottom = 24;
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + workArea.height - height - marginBottom);
  return { x, y, width, height };
}

function getResponseWindowBounds(width, height) {
  const fallback = getChatWindowBounds(width, height);
  if (!chatWindow || chatWindow.isDestroyed()) {
    return fallback;
  }

  const chatBounds = chatWindow.getBounds();
  const gap = 10;
  return {
    x: Math.round(chatBounds.x + (chatBounds.width - width) / 2),
    y: Math.round(chatBounds.y - gap - height),
    width,
    height,
  };
}

function getContextLabelWindowBounds() {
  if (!chatWindow || chatWindow.isDestroyed()) {
    const fallback = getChatWindowBounds(CONTEXT_LABEL_WIDTH, CONTEXT_LABEL_HEIGHT);
    return {
      x: fallback.x,
      y: fallback.y - CONTEXT_LABEL_HEIGHT - CONTEXT_LABEL_GAP_ABOVE_CHATBOX,
      width: CONTEXT_LABEL_WIDTH,
      height: CONTEXT_LABEL_HEIGHT,
    };
  }

  const chatBounds = chatWindow.getBounds();
  return {
    x: chatBounds.x + CONTEXT_LABEL_OFFSET_X,
    y: chatBounds.y - CONTEXT_LABEL_HEIGHT - CONTEXT_LABEL_GAP_ABOVE_CHATBOX,
    width: CONTEXT_LABEL_WIDTH,
    height: CONTEXT_LABEL_HEIGHT,
  };
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
    capturePreviousExternalFocusedWindow();
    chatWindow.focus();
    chatWindow.webContents.send('chatbox-focus');
  }
  sendWakewordToggle(false);
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
  sendWakewordToggle(true);
  return { success: true };
}

function showMainWindow({ focus = true } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { success: false, reason: 'Main window not available' };
  }
  if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
    hideChatWindow();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (focus) {
    mainWindow.focus();
  }
  return { success: true };
}

function handleResponseOverlayPhaseChange(event = {}) {
  if (ENABLE_OS_TOOL_GHOST_DEBUG) {
    return;
  }
  const nextPhase = event?.phase;
  if (!Object.values(RESPONSE_OVERLAY_PHASE).includes(nextPhase)) {
    return;
  }
  responseOverlayPhase = nextPhase;

  if (nextPhase === RESPONSE_OVERLAY_PHASE.IDLE) {
    responseOverlayVisible = false;
    if (responseWindow && !responseWindow.isDestroyed() && responseWindow.isVisible()) {
      responseWindow.hide();
    }
    broadcastResponseOverlayVisibility(false);
    syncContextLabelWindowVisibility();
    return;
  }

  if (isResponseOverlayStreamingPhase()) {
    responseOverlayVisible = true;
    broadcastResponseOverlayVisibility(true);
    if (!responseWindow || responseWindow.isDestroyed()) {
      return;
    }
    ensureResponseOverlayFallbackBounds();
    if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
      showResponseWindowInactive();
    }
    syncContextLabelWindowVisibility();
    return;
  }

  if (
    responseOverlayVisible
    && responseWindow
    && !responseWindow.isDestroyed()
    && chatWindow
    && !chatWindow.isDestroyed()
    && chatWindow.isVisible()
  ) {
    showResponseWindowInactive();
  }
  syncContextLabelWindowVisibility();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000, // Increased width to accommodate sidebar
    height: 700,
    show: false,
    frame: false,
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
  initializeWakewordBridge(mainWindow, () => showChatWindow({ focus: true }));
  initializeLocalBackendBridge(() => ({
    mainWindow,
    chatWindow,
    responseWindow,
    contextLabelWindow,
  }));
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

function createContextLabelWindow() {
  contextLabelWindow = createOverlayBrowserWindow({
    width: CONTEXT_LABEL_WIDTH,
    height: CONTEXT_LABEL_HEIGHT,
    show: false,
  });
  enableContentProtectionSafely(contextLabelWindow, 'context label');

  contextLabelWindow.setAlwaysOnTop(true, 'floating');
  contextLabelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  positionContextLabelWindow();

  loadRendererView(contextLabelWindow, 'chatbox-context-label');

  contextLabelWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      contextLabelWindow.hide();
    }
    return false;
  });

  contextLabelWindow.on('closed', () => {
    contextLabelWindow = null;
  });

  return contextLabelWindow;
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
  createContextLabelWindow();
  createTray();
  sendWakewordToggle(false);

  if (chatWindow) {
    registerRendererWindow(chatWindow);
  }
  if (responseWindow) {
    registerRendererWindow(responseWindow);
  }
  if (contextLabelWindow) {
    registerRendererWindow(contextLabelWindow);
  }
  syncContextLabelWindowVisibility();

  screen.on('display-metrics-changed', () => {
    positionChatWindow();
    positionResponseWindow();
    positionContextLabelWindow();
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
      const contextLabelOverlay = createContextLabelWindow();
      if (chatOverlay) {
        registerRendererWindow(chatOverlay);
      }
      if (responseOverlay) {
        registerRendererWindow(responseOverlay);
      }
      if (contextLabelOverlay) {
        registerRendererWindow(contextLabelOverlay);
      }
      syncContextLabelWindowVisibility();
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
    const targetWindows = [chatWindow, responseWindow, contextLabelWindow].filter(
      (win) => win && !win.isDestroyed(),
    );
    if (targetWindows.length === 0) {
      return { success: false, reason: 'Overlay windows not available' };
    }
    try {
      targetWindows.forEach((win) => {
        if (ignore) {
          win.setIgnoreMouseEvents(true, { forward: true });
        } else {
          win.setIgnoreMouseEvents(false);
        }
      });
      return { success: true };
    } catch (error) {
      return { success: false, reason: `Failed to update ignore state: ${error.message}` };
    }
  });

  ipcMain.handle('set-chatbox-size', async (event, { width, height } = {}) => {
    if (!chatWindow || chatWindow.isDestroyed()) {
      return { success: false, reason: 'Chat window not available' };
    }
    const nextWidth = Math.max(1, Math.min(900, Math.round(Number(width) || 0)));
    const nextHeight = Math.max(1, Math.min(7500, Math.round(Number(height) || 0)));
    try {
      const [curWidth, curHeight] = chatWindow.getSize();
      if (curWidth === nextWidth && curHeight === nextHeight) {
        return { success: true, resized: false };
      }
      // Apply size+position atomically to keep the chat input pill anchored.
      const bounds = getChatWindowBounds(nextWidth, nextHeight);
      chatWindow.setBounds(bounds, false);
      positionResponseWindow();
      positionContextLabelWindow();
      syncContextLabelWindowVisibility();
      return { success: true, resized: true, width: nextWidth, height: nextHeight };
    } catch (error) {
      return { success: false, reason: `Failed to resize chatbox: ${error.message}` };
    }
  });

  ipcMain.on('move-chatbox-to', (event, { x, y } = {}) => {
    if (!chatWindow || chatWindow.isDestroyed()) {
      return;
    }
    const nextX = Math.round(Number(x));
    const nextY = Math.round(Number(y));
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }

    try {
      chatWindow.setPosition(nextX, nextY, false);
      positionResponseWindow();
      positionContextLabelWindow();
      syncContextLabelWindowVisibility();
    } catch (error) {
      console.warn('[Main] Failed to move chatbox:', error?.message || error);
    }
  });

  ipcMain.handle('set-responsebox-size', async (event, {
    width,
    height,
    visible,
    full_screen: fullScreen = false,
  } = {}) => {
    if (!responseWindow || responseWindow.isDestroyed()) {
      return { success: false, reason: 'Response window not available' };
    }

    const shouldShow = Boolean(visible);
    if (!shouldShow) {
      responseOverlayVisible = false;
      if (responseWindow.isVisible()) {
        responseWindow.hide();
      }
      broadcastResponseOverlayVisibility(false);
      syncContextLabelWindowVisibility();
      return { success: true, visible: false };
    }

    if (fullScreen === true) {
      try {
        const fallbackDisplay = screen.getPrimaryDisplay();
        const targetDisplay = (
          chatWindow
          && !chatWindow.isDestroyed()
          && typeof screen.getDisplayMatching === 'function'
        )
          ? screen.getDisplayMatching(chatWindow.getBounds()) || fallbackDisplay
          : fallbackDisplay;
        const bounds = targetDisplay?.bounds || fallbackDisplay.bounds;
        const nextBounds = {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.max(1, Math.round(bounds.width)),
          height: Math.max(1, Math.round(bounds.height)),
        };
        responseWindow.setBounds(nextBounds, false);
        responseOverlayVisible = true;
        if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
          if (typeof responseWindow.showInactive === 'function') {
            responseWindow.showInactive();
          } else {
            responseWindow.show();
          }
          ensureResponseWindowOnTop();
        }
        broadcastResponseOverlayVisibility(true);
        syncContextLabelWindowVisibility();
        return {
          success: true,
          visible: true,
          fullScreen: true,
          width: nextBounds.width,
          height: nextBounds.height,
        };
      } catch (error) {
        return { success: false, reason: `Failed to enter fullscreen ghost overlay: ${error.message}` };
      }
    }

    const nextWidth = Math.max(1, Math.min(900, Math.round(Number(width) || 0)));
    const nextHeight = Math.max(1, Math.min(750, Math.round(Number(height) || 0)));
    try {
      const bounds = getResponseWindowBounds(nextWidth, nextHeight);
      responseWindow.setBounds(bounds, false);
      responseOverlayVisible = true;
      if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
        if (typeof responseWindow.showInactive === 'function') {
          responseWindow.showInactive();
        } else {
          responseWindow.show();
        }
        ensureResponseWindowOnTop();
      }
      broadcastResponseOverlayVisibility(true);
      syncContextLabelWindowVisibility();
      return {
        success: true,
        visible: true,
        width: nextWidth,
        height: nextHeight,
      };
    } catch (error) {
      return { success: false, reason: `Failed to resize response overlay: ${error.message}` };
    }
  });

  ipcMain.handle('show-main-window', async () => {
    try {
      return showMainWindow({ focus: true });
    } catch (error) {
      return { success: false, reason: `Failed to show main window: ${error.message}` };
    }
  });

  ipcMain.handle('show-chatbox', async (event, options = {}) => {
    const focus = options?.focus !== false;
    return showChatWindow({ focus });
  });

  ipcMain.handle('hide-chatbox', async () => {
    return hideChatWindow();
  });

  ipcMain.handle('get-displays', async () => {
    const displays = screen.getAllDisplays();
    const primaryId = screen.getPrimaryDisplay().id;
    return displays.map((display, index) => ({
      id: display.id,
      label: `Display ${index + 1} (${display.size.width}x${display.size.height})`,
      isPrimary: display.id === primaryId,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    }));
  });

  ipcMain.handle('window-minimize', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, reason: 'Main window not available' };
    }
    mainWindow.minimize();
    return { success: true };
  });

  ipcMain.handle('window-toggle-maximize', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, reason: 'Main window not available', isMaximized: false };
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return { success: true, isMaximized: mainWindow.isMaximized() };
  });

  ipcMain.handle('window-close', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, reason: 'Main window not available' };
    }
    mainWindow.close();
    return { success: true };
  });
}
