const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { initializeIpc } = require('./ipc.cjs');
const { initializeWakewordBridge } = require('./wakeword_bridge.cjs');
const { initializeLocalBackendBridge, stopLocalBackend } = require('./local_backend_bridge.cjs');

// Disable hardware acceleration to prevent GPU crashes
app.disableHardwareAcceleration();

// Suppress GPU-related warnings
process.env.LIBGL_ALWAYS_SOFTWARE = '1';
process.env.GALLIUM_DRIVER = 'llvmpipe';

let mainWindow = null;
let tray = null;

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

  const devUrl = 'http://localhost:5173';
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL(devUrl);
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  initializeIpc(mainWindow);
  initializeWakewordBridge(mainWindow);
  initializeLocalBackendBridge(mainWindow);
  initializeWindowMinimizeHandler();

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
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
function initializeWindowMinimizeHandler() {
  ipcMain.handle('minimize-window-delayed', async () => {
    if (!mainWindow) {
      return { success: false, reason: 'Window not available' };
    }

    // Check if already minimized - skip if so
    if (mainWindow.isMinimized()) {
      return { success: false, reason: 'Already minimized' };
    }

    // Check if window is visible or focused
    const isVisible = mainWindow.isVisible();
    const isFocused = mainWindow.isFocused();

    if (!isVisible && !isFocused) {
      return { success: false, reason: 'Window not visible or focused' };
    }

    // Wait 2 seconds before minimizing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Re-check window state after delay (window might have been closed/minimized)
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, reason: 'Window destroyed during delay' };
    }

    if (mainWindow.isMinimized()) {
      return { success: false, reason: 'Window minimized during delay' };
    }

    // Minimize the window
    try {
      mainWindow.minimize();
      return { success: true };
    } catch (error) {
      return { success: false, reason: `Failed to minimize: ${error.message}` };
    }
  });
}
