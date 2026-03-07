const {
  createContentProtectionRuntime,
} = require('./platform/content_protection/index.cjs');
const {
  setOverlayAlwaysOnTop,
  setOverlayVisibleOnAllWorkspaces,
} = require('./overlay_topmost_runtime.cjs');
const {
  resolveAppIconNativeImage,
  resolveAppIconPathRuntime,
  resolveTrayIconNativeImage,
} = require('./main_window_icon_runtime.cjs');
const {
  createLazyRendererViewLoader,
  createOverlayBrowserWindow,
  loadRendererView,
} = require('./main_window_overlay_runtime.cjs');

const CHATBOX_OVERLAY_FIXED_WIDTH = 520;
const CHATBOX_OVERLAY_FIXED_HEIGHT = 116;

async function prepareOverlayQueryCaptureFocus({
  chatWindow,
  responseWindow,
  mainWindow,
  waitMs = 120,
}) {
  if (chatWindow && !chatWindow.isDestroyed() && typeof chatWindow.blur === 'function') {
    chatWindow.blur();
  }
  if (responseWindow && !responseWindow.isDestroyed() && typeof responseWindow.blur === 'function') {
    responseWindow.blur();
  }
  if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.blur === 'function') {
    mainWindow.blur();
  }

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return {
    restoredExternalFocus: false,
    demotedOverlayFocus: false,
    externalFocusActive: false,
    canVerifyExternalFocus: false,
  };
}

function enableContentProtectionSafely({
  targetWindow,
  platform,
  windowLabel,
  warn = console.warn,
}) {
  const runtime = createContentProtectionRuntime(platform);
  runtime({
    targetWindow,
    windowLabel,
    warn,
  });
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
  vmMode = false,
  minimizeToTrayOnClose = true,
  enableDevTransparencyUi,
  enableDebugStreamTrace = false,
  enableDebugToolScreenshot = false,
  initializeIpc,
  applyResponseOverlayPhase,
  prepareOverlayQueryCaptureFocus,
  initializeWakewordBridge,
  showChatWindow,
  emitWakewordSttTrigger,
  initializeLocalBackendBridge,
  initializeMainProcessIpc,
  getLatestFrontendConfig,
  getWindows,
  setMainWindow,
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  warn = console.warn,
}) {
  const allowDevTools = Boolean(enableDevTransparencyUi);
  const appIcon = resolveAppIcon({
    resolveAppIconPath,
    warn,
  });
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
      devTools: allowDevTools,
    },
    ...(appIcon ? { icon: appIcon } : {}),
  });

  setMainWindow(mainWindow);
  loadRendererView({
    targetWindow: mainWindow,
    app,
    path,
    vmMode,
    enableDevTransparencyUi,
    enableDebugStreamTrace,
    enableDebugToolScreenshot,
  });

  initializeIpc(mainWindow, {
    applyResponseOverlayPhase,
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
  initializeMainProcessIpc();

  if (platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.on('close', (event) => {
    if (minimizeToTrayOnClose && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showChatWindow({ focus: true });
      return false;
    }
    return undefined;
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
  enableDebugStreamTrace = false,
  enableDebugToolScreenshot = false,
  positionChatWindow,
  hideChatWindow,
  syncWakewordToggleForChatVisibility,
  externalFocusTracker,
  setChatWindow,
  enableContentProtectionSafely,
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  warn = console.warn,
}) {
  const appIcon = resolveAppIcon({
    resolveAppIconPath,
    warn,
  });
  const chatWindow = createOverlayBrowserWindow({
    BrowserWindow,
    path,
    width: CHATBOX_OVERLAY_FIXED_WIDTH,
    height: CHATBOX_OVERLAY_FIXED_HEIGHT,
    icon: appIcon,
    allowDevTools: Boolean(enableDevTransparencyUi),
  });
  setChatWindow(chatWindow);
  enableContentProtectionSafely({ targetWindow: chatWindow, platform, windowLabel: 'chat box' });

  setOverlayAlwaysOnTop({
    targetWindow: chatWindow,
    platform,
    warn,
    windowLabel: 'chat box',
  });
  setOverlayVisibleOnAllWorkspaces({
    targetWindow: chatWindow,
    platform,
    warn,
    windowLabel: 'chat box',
  });
  chatWindow.setIgnoreMouseEvents(false);
  positionChatWindow();

  const ensureChatRendererLoaded = createLazyRendererViewLoader({
    targetWindow: chatWindow,
    view: 'chatbox',
    app,
    path,
    enableDevTransparencyUi,
    enableDebugStreamTrace,
    enableDebugToolScreenshot,
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
    ensureChatRendererLoaded();
    syncWakewordToggleForChatVisibility();
  });

  chatWindow.on('hide', () => {
    syncWakewordToggleForChatVisibility();
  });

  chatWindow.on('blur', () => {
    if (typeof externalFocusTracker?.capturePreviousExternalFocusedWindow !== 'function') {
      return;
    }
    setTimeout(() => {
      externalFocusTracker.capturePreviousExternalFocusedWindow();
    }, 30);
  });

  return chatWindow;
}

function createResponseWindow({
  BrowserWindow,
  path,
  app,
  platform,
  enableDevTransparencyUi,
  enableDebugStreamTrace = false,
  enableDebugToolScreenshot = false,
  enableOsToolGhostDebug,
  responseWindowDebugView,
  positionResponseWindow,
  showResponseWindowInactive,
  setResponseOverlayVisible,
  setResponseOverlayVisibilityState,
  syncContextLabelWindowVisibility,
  setResponseWindow,
  enableContentProtectionSafely,
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  warn = console.warn,
}) {
  const appIcon = resolveAppIcon({
    resolveAppIconPath,
    warn,
  });
  const responseWindow = createOverlayBrowserWindow({
    BrowserWindow,
    path,
    width: 520,
    height: enableOsToolGhostDebug ? 620 : 1,
    show: enableOsToolGhostDebug,
    icon: appIcon,
    allowDevTools: Boolean(enableDevTransparencyUi),
  });
  setResponseWindow(responseWindow);
  enableContentProtectionSafely({
    targetWindow: responseWindow,
    platform,
    windowLabel: 'response overlay',
  });

  setOverlayAlwaysOnTop({
    targetWindow: responseWindow,
    platform,
    warn,
    windowLabel: 'response overlay',
  });
  setOverlayVisibleOnAllWorkspaces({
    targetWindow: responseWindow,
    platform,
    warn,
    windowLabel: 'response overlay',
  });

  const ensureResponseRendererLoaded = createLazyRendererViewLoader({
    targetWindow: responseWindow,
    view: enableOsToolGhostDebug ? responseWindowDebugView : 'chatbox-response',
    app,
    path,
    enableDevTransparencyUi,
    enableDebugStreamTrace,
    enableDebugToolScreenshot,
  });

  if (enableOsToolGhostDebug) {
    ensureResponseRendererLoaded();
    setResponseOverlayVisible(true);
    positionResponseWindow();
    showResponseWindowInactive();
  }

  responseWindow.on('show', () => {
    ensureResponseRendererLoaded();
  });

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

function createTray({
  Tray,
  Menu,
  showMainWindow,
  app,
  resolveTrayIconPath = resolveAppIconPathRuntime,
  warn = console.warn,
}) {
  const icon = resolveTrayIconNativeImage({
    iconPath: resolveTrayIconPath(),
    warn,
  });
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

  tray.setToolTip('WindieOS');
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
