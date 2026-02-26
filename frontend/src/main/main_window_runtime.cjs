const { nativeImage } = require('electron');

async function prepareOverlayQueryCaptureFocus({
  chatWindow,
  mainWindow,
  externalFocusTracker,
  waitMs = 120,
}) {
  if (chatWindow && !chatWindow.isDestroyed() && typeof chatWindow.blur === 'function') {
    chatWindow.blur();
  }
  if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.blur === 'function') {
    mainWindow.blur();
  }
  externalFocusTracker.restorePreviousExternalFocusedWindow();
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function loadRendererView({
  targetWindow,
  view,
  app,
  path,
  enableDevTransparencyUi = false,
}) {
  const query = {};
  if (view) {
    query.view = view;
  }
  if (enableDevTransparencyUi) {
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

function createOverlayBrowserWindow({
  BrowserWindow,
  path,
  width,
  height,
  show,
}) {
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
    hasShadow: false,
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

function enableContentProtectionSafely({
  targetWindow,
  platform,
  windowLabel,
  warn = console.warn,
}) {
  if (platform !== 'win32' && platform !== 'darwin') {
    return;
  }
  try {
    targetWindow.setContentProtection(true);
  } catch (error) {
    warn(
      `[Main] Failed to enable ${windowLabel} content protection:`,
      error?.message || error,
    );
  }
}

function normalizeMainWindowOpenTarget({ options = {}, allowedTargets }) {
  if (!options || typeof options !== 'object') {
    return null;
  }
  const openTarget = typeof options.open === 'string' ? options.open.trim().toLowerCase() : '';
  if (!allowedTargets.has(openTarget)) {
    return null;
  }
  return openTarget;
}

function emitMainWindowOpenTarget({ target, mainWindow, channel }) {
  if (!target || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, { target });
}

function createMainWindow({
  BrowserWindow,
  path,
  app,
  platform,
  enableDevTransparencyUi,
  initializeIpc,
  handleResponseOverlayPhaseChange,
  prepareOverlayQueryCaptureFocus,
  initializeWakewordBridge,
  showChatWindow,
  emitWakewordSttTrigger,
  initializeLocalBackendBridge,
  initializeOverlayHandlers,
  getLatestFrontendConfig,
  getWindows,
  setMainWindow,
  enableContentProtectionSafely,
}) {
  const mainWindow = new BrowserWindow({
    width: 1000,
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
  });

  setMainWindow(mainWindow);
  enableContentProtectionSafely({ targetWindow: mainWindow, platform, windowLabel: 'main window' });
  loadRendererView({
    targetWindow: mainWindow,
    app,
    path,
    enableDevTransparencyUi,
  });

  initializeIpc(mainWindow, {
    onResponseOverlayPhaseChange: handleResponseOverlayPhaseChange,
    onBeforeOverlayQueryCapture: prepareOverlayQueryCaptureFocus,
    isPackaged: app.isPackaged,
  });
  initializeWakewordBridge(mainWindow, () => {
    const result = showChatWindow({ focus: true });
    if (result?.success) {
      emitWakewordSttTrigger();
    }
  });
  initializeLocalBackendBridge(getWindows, {
    getFrontendConfig: getLatestFrontendConfig,
    isPackaged: app.isPackaged,
  });
  initializeOverlayHandlers();

  if (platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showChatWindow({ focus: true });
    }
    return false;
  });

  mainWindow.on('closed', () => {
    setMainWindow(null);
  });

  return mainWindow;
}

function createChatWindow({
  BrowserWindow,
  path,
  app,
  platform,
  enableDevTransparencyUi,
  positionChatWindow,
  hideChatWindow,
  syncWakewordToggleForChatVisibility,
  setChatWindow,
  enableContentProtectionSafely,
}) {
  const chatWindow = createOverlayBrowserWindow({
    BrowserWindow,
    path,
    width: 520,
    height: 96,
  });
  setChatWindow(chatWindow);
  enableContentProtectionSafely({ targetWindow: chatWindow, platform, windowLabel: 'chat box' });

  chatWindow.setAlwaysOnTop(true, 'floating');
  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  chatWindow.setIgnoreMouseEvents(false);
  positionChatWindow();

  loadRendererView({
    targetWindow: chatWindow,
    view: 'chatbox',
    app,
    path,
    enableDevTransparencyUi,
  });

  chatWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      hideChatWindow();
    }
    return false;
  });

  chatWindow.on('closed', () => {
    setChatWindow(null);
  });

  chatWindow.on('show', () => {
    syncWakewordToggleForChatVisibility();
  });

  chatWindow.on('hide', () => {
    syncWakewordToggleForChatVisibility();
  });

  return chatWindow;
}

function createResponseWindow({
  BrowserWindow,
  path,
  app,
  platform,
  enableDevTransparencyUi,
  enableOsToolGhostDebug,
  responseWindowDebugView,
  positionResponseWindow,
  showResponseWindowInactive,
  setResponseOverlayVisible,
  setResponseOverlayVisibilityState,
  syncContextLabelWindowVisibility,
  setResponseWindow,
  enableContentProtectionSafely,
}) {
  const responseWindow = createOverlayBrowserWindow({
    BrowserWindow,
    path,
    width: 520,
    height: enableOsToolGhostDebug ? 620 : 1,
    show: enableOsToolGhostDebug,
  });
  setResponseWindow(responseWindow);
  enableContentProtectionSafely({
    targetWindow: responseWindow,
    platform,
    windowLabel: 'response overlay',
  });

  responseWindow.setAlwaysOnTop(true, 'floating');
  responseWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  loadRendererView({
    targetWindow: responseWindow,
    view: enableOsToolGhostDebug ? responseWindowDebugView : 'chatbox-response',
    app,
    path,
    enableDevTransparencyUi,
  });

  if (enableOsToolGhostDebug) {
    setResponseOverlayVisible(true);
    positionResponseWindow();
    showResponseWindowInactive();
  }

  responseWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      setResponseOverlayVisibilityState(false);
      responseWindow.hide();
    }
    return false;
  });

  responseWindow.on('closed', () => {
    setResponseWindow(null);
    setResponseOverlayVisible(false);
    syncContextLabelWindowVisibility();
  });

  return responseWindow;
}

function createTray({ Tray, Menu, showMainWindow, app }) {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  );
  const tray = new Tray(icon);

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

  return tray;
}

module.exports = {
  createChatWindow,
  createMainWindow,
  createResponseWindow,
  createTray,
  emitMainWindowOpenTarget,
  enableContentProtectionSafely,
  normalizeMainWindowOpenTarget,
  prepareOverlayQueryCaptureFocus,
};
