const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, screen } = require('electron');
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

function transformToAgentUI() {
  if (!mainWindow) {
    console.log('[Main] transformToAgentUI: mainWindow is null');
    return;
  }
  
  console.log('[Main] Transforming window to agent UI...');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  
  // Resize to compact overlay
  mainWindow.setSize(350, 600);
  mainWindow.setPosition(width - 350, 0);
  console.log(`[Main] Window resized to 350x600, positioned at (${width - 350}, 0)`);
  
  // Enable click-through (except for specific elements)
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  console.log('[Main] Click-through enabled');
  
  // Enable screenshot exclusion
  mainWindow.setContentProtection(true);
  console.log('[Main] Content protection enabled');
  
  // Keep on top
  mainWindow.setAlwaysOnTop(true);
  console.log('[Main] Always on top enabled');
  
  // Ensure window is visible and focused
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop(); // Bring to front
  console.log('[Main] Window shown, focused, and brought to front');
}

function transformToChatUI() {
  if (!mainWindow) return;
  
  // Restore normal size
  mainWindow.setSize(1000, 700);
  mainWindow.center();
  
  // Disable click-through
  mainWindow.setIgnoreMouseEvents(false);
  
  // Disable screenshot exclusion
  mainWindow.setContentProtection(false);
  
  // Disable always on top
  mainWindow.setAlwaysOnTop(false);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  
  // Emergency Escape Hatch: Shift+Esc
  globalShortcut.register('Shift+Escape', () => {
    console.log('[Main] Emergency restore triggered');
    transformToChatUI();
    mainWindow?.webContents.send('force-mode-reset');
  });
  
  // IPC handlers for window transformation
  ipcMain.on('transform-to-agent-ui', () => {
    console.log('[Main] Received transform-to-agent-ui request');
    transformToAgentUI();
    console.log('[Main] Window transformed to agent UI');
  });
  
  ipcMain.on('transform-to-chat-ui', () => {
    transformToChatUI();
  });

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
  console.log('[Main] App quitting, cleaning up subprocesses...');
  stopLocalBackend();
});

// Prevent app from quitting when all windows are closed.
// The app will continue to run in the system tray.
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
