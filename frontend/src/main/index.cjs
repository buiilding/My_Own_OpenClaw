const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
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
let tray = null;
let overlayHandlersInitialized = false;

function positionChatWindow() {
  if (!chatWindow) {
    return;
  }
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const [width, height] = chatWindow.getSize();
  const marginBottom = 24;
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + workArea.height - height - marginBottom);
  chatWindow.setPosition(x, y, false);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000, // Increased width to accommodate sidebar
    height: 700,
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
  initializeWakewordBridge(mainWindow);
  initializeLocalBackendBridge(() => ({ mainWindow, chatWindow }));
  initializeOverlayHandlers();

  // Instead of quitting, hide the window to the tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
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
    height: 140,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
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
  chatWindow.setIgnoreMouseEvents(true, { forward: true });
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
      chatWindow.hide();
    }
    return false;
  });

  chatWindow.on('closed', () => {
    chatWindow = null;
  });

  return chatWindow;
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
        mainWindow.show();
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
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createChatWindow();
  createTray();

  if (chatWindow) {
    registerRendererWindow(chatWindow);
  }

  screen.on('display-metrics-changed', () => {
    positionChatWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      const overlay = createChatWindow();
      if (overlay) {
        registerRendererWindow(overlay);
      }
    } else {
      mainWindow.show();
    }
  });
});

// Handle app quit to cleanup subprocesses
app.on('before-quit', () => {
  app.isQuitting = true;
  console.log('[Main] App quitting, cleaning up subprocesses...');
  stopLocalBackend();
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

  ipcMain.handle('show-main-window', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, reason: 'Main window not available' };
    }
    try {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
      return { success: true };
    } catch (error) {
      return { success: false, reason: `Failed to show main window: ${error.message}` };
    }
  });
}
