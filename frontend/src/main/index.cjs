const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const { initializeIpc, registerRendererWindow } = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword_bridge.cjs');
const { initializeLocalBackendBridge, stopLocalBackend } = require('./local_backend_bridge.cjs');

// Disable hardware acceleration to prevent GPU crashes
app.disableHardwareAcceleration();

// Suppress GPU-related warnings
process.env.LIBGL_ALWAYS_SOFTWARE = '1';
process.env.GALLIUM_DRIVER = 'llvmpipe';

let mainWindow = null;
let chatWindow = null;
let responseWindow = null;
let tray = null;
let overlayHandlersInitialized = false;
let responseOverlayVisible = false;
const WAKEWORD_HOTKEY = 'Super+Alt+W';

function positionChatWindow() {
  if (!chatWindow) {
    return;
  }
  const [width, height] = chatWindow.getSize();
  const { x, y } = getChatWindowBounds(width, height);
  chatWindow.setPosition(x, y, false);
  positionResponseWindow();
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

function positionResponseWindow() {
  if (!responseWindow || responseWindow.isDestroyed() || !responseOverlayVisible) {
    return;
  }
  const [width, height] = responseWindow.getSize();
  const bounds = getResponseWindowBounds(width, height);
  responseWindow.setBounds(bounds, false);
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

function sendWakewordToggle(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('wakeword-toggle', { enabled: Boolean(enabled) });
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
  if (responseWindow && !responseWindow.isDestroyed() && responseOverlayVisible) {
    if (typeof responseWindow.showInactive === 'function') {
      responseWindow.showInactive();
    } else {
      responseWindow.show();
    }
    ensureResponseWindowOnTop();
  }
  if (focus) {
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000, // Increased width to accommodate sidebar
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Optional: Hide from taskbar when minimized to tray
    // skipTaskbar: true,
  });

  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      mainWindow.setContentProtection(true);
    } catch (error) {
      console.warn('[Main] Failed to enable content protection:', error?.message || error);
    }
  }

  const devUrl = 'http://localhost:5173';
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL(devUrl);
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  initializeIpc(mainWindow);
  initializeWakewordBridge(mainWindow, () => showChatWindow({ focus: true }));
  initializeLocalBackendBridge(() => ({ mainWindow, chatWindow, responseWindow }));
  initializeOverlayHandlers();

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
  chatWindow = new BrowserWindow({
    width: 520,
    height: 96,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Use CSS shadow for the pill; WM window shadows are often rectangular on Linux.
    hasShadow: false,
    // Hint to Linux compositors that this is a small utility window (often reduces WM shadows).
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      chatWindow.setContentProtection(true);
    } catch (error) {
      console.warn('[Main] Failed to enable chat box content protection:', error?.message || error);
    }
  }

  chatWindow.setAlwaysOnTop(true, 'floating');
  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  chatWindow.setIgnoreMouseEvents(false);
  positionChatWindow();

  const devUrl = 'http://localhost:5173';
  if (process.env.NODE_ENV !== 'production') {
    chatWindow.loadURL(`${devUrl}?view=chatbox`);
  } else {
    chatWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      query: { view: 'chatbox' },
    });
  }

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
  responseWindow = new BrowserWindow({
    width: 520,
    height: 1,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    type: 'toolbar',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      responseWindow.setContentProtection(true);
    } catch (error) {
      console.warn('[Main] Failed to enable response overlay content protection:', error?.message || error);
    }
  }

  responseWindow.setAlwaysOnTop(true, 'floating');
  responseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const devUrl = 'http://localhost:5173';
  if (process.env.NODE_ENV !== 'production') {
    responseWindow.loadURL(`${devUrl}?view=chatbox-response`);
  } else {
    responseWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      query: { view: 'chatbox-response' },
    });
  }

  responseWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      responseOverlayVisible = false;
      responseWindow.hide();
    }
    return false;
  });

  responseWindow.on('closed', () => {
    responseWindow = null;
    responseOverlayVisible = false;
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
  sendWakewordToggle(false);

  if (chatWindow) {
    registerRendererWindow(chatWindow);
  }
  if (responseWindow) {
    registerRendererWindow(responseWindow);
  }

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
      if (chatOverlay) {
        registerRendererWindow(chatOverlay);
      }
      if (responseOverlay) {
        registerRendererWindow(responseOverlay);
      }
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
    if (!chatWindow || chatWindow.isDestroyed()) {
      return { success: false, reason: 'Chat window not available' };
    }
    try {
      if (ignore) {
        chatWindow.setIgnoreMouseEvents(true, { forward: true });
      } else {
        chatWindow.setIgnoreMouseEvents(false);
      }
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
    const nextHeight = Math.max(1, Math.min(1500, Math.round(Number(height) || 0)));
    try {
      const [curWidth, curHeight] = chatWindow.getSize();
      if (curWidth === nextWidth && curHeight === nextHeight) {
        return { success: true, resized: false };
      }
      // Apply size+position atomically to keep the chat input pill anchored.
      const bounds = getChatWindowBounds(nextWidth, nextHeight);
      chatWindow.setBounds(bounds, false);
      positionResponseWindow();
      return { success: true, resized: true, width: nextWidth, height: nextHeight };
    } catch (error) {
      return { success: false, reason: `Failed to resize chatbox: ${error.message}` };
    }
  });

  ipcMain.handle('set-responsebox-size', async (event, { width, height, visible } = {}) => {
    if (!responseWindow || responseWindow.isDestroyed()) {
      return { success: false, reason: 'Response window not available' };
    }

    const shouldShow = Boolean(visible);
    if (!shouldShow) {
      responseOverlayVisible = false;
      if (responseWindow.isVisible()) {
        responseWindow.hide();
      }
      return { success: true, visible: false };
    }

    const nextWidth = Math.max(1, Math.min(900, Math.round(Number(width) || 0)));
    const nextHeight = Math.max(1, Math.min(1500, Math.round(Number(height) || 0)));
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
}
