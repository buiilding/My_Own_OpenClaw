const { app, BrowserWindow, Tray, Menu, nativeImage, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { initializeIpc } = require('./ipc.cjs');

// Simple store using JSON file
const storePath = path.join(app.getPath('userData'), 'window-state.json');

const store = {
  get(key, defaultValue) {
    try {
      if (fs.existsSync(storePath)) {
        const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        return data[key] !== undefined ? data[key] : defaultValue;
      }
    } catch (error) {
      console.error('Error reading store:', error);
    }
    return defaultValue;
  },
  set(key, value) {
    try {
      let data = {};
      if (fs.existsSync(storePath)) {
        data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      }
      data[key] = value;
      fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing store:', error);
    }
  }
};

// Enable hardware acceleration for smooth animations
// app.disableHardwareAcceleration(); // Commented out for overlay performance

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    transparent: true, // Enable transparency for overlay
    frame: false, // Remove window frame
    alwaysOnTop: true, // Keep window on top
    resizable: false, // Fixed size for overlay
    movable: true, // Ensure window is movable
    hasShadow: false, // Remove shadow for clean overlay
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    skipTaskbar: false, // Show in taskbar for easy access
    backgroundColor: '#00000000', // Fully transparent background
    fullscreenable: false, // Prevent fullscreen
    maximizable: false, // Prevent maximize
  });

  // Allow window to be positioned anywhere, including under menu bar
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  const devUrl = 'http://localhost:5173';
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL(devUrl);
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Set window position - restore last position or use default (10% from top, centered)
  mainWindow.once('ready-to-show', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Get saved position or calculate default
    const savedPosition = store.get('window-position', {
      x: Math.floor((screenWidth - 900) / 2), // Horizontally centered
      y: Math.floor(screenHeight * 0.10) // 10% from top
    });

    mainWindow.setPosition(savedPosition.x, savedPosition.y);

    // Save position when window is moved (with debounce)
    let savePositionTimeout;
    mainWindow.on('move', () => {
      clearTimeout(savePositionTimeout);
      savePositionTimeout = setTimeout(() => {
        const [x, y] = mainWindow.getPosition();
        store.set('window-position', { x, y });
      }, 100);
    });
  });

  initializeIpc(mainWindow);

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

  // Unregister shortcuts when quitting
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  tray.setToolTip('Desktop Assistant');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Register global shortcut to toggle collapse mode
  globalShortcut.register('CommandOrControl+/', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toggle-collapse');
    }
  });

  // Register global shortcut to toggle voice mode
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toggle-voice-mode');
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

// Prevent app from quitting when all windows are closed.
// The app will continue to run in the system tray.
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
