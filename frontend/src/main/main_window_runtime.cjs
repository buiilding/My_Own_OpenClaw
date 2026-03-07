const { nativeImage } = require('electron');
const fs = require('fs');
const nodePath = require('path');
const {
  createContentProtectionRuntime,
} = require('./platform/content_protection/index.cjs');
const {
  setOverlayAlwaysOnTop,
  setOverlayVisibleOnAllWorkspaces,
} = require('./overlay_topmost_runtime.cjs');
const CHATBOX_OVERLAY_FIXED_WIDTH = 520;
const CHATBOX_OVERLAY_FIXED_HEIGHT = 116;
const APP_ICON_RELATIVE_PATH = nodePath.join('src', 'main', 'assets', 'icons', 'windieos.app.png');
const TRAY_ICON_FALLBACK_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function resolveAppIconPathRuntime({
  existsSync = fs.existsSync,
  resourcesPath = process.resourcesPath,
  cwd = process.cwd(),
} = {}) {
  const candidates = [
    nodePath.join(__dirname, 'assets', 'icons', 'windieos.app.png'),
    resourcesPath ? nodePath.join(resourcesPath, APP_ICON_RELATIVE_PATH) : null,
    cwd ? nodePath.join(cwd, APP_ICON_RELATIVE_PATH) : null,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') {
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveTrayIconNativeImage({
  iconPath,
  warn = console.warn,
} = {}) {
  if (iconPath && typeof nativeImage.createFromPath === 'function') {
    const resolvedIcon = nativeImage.createFromPath(iconPath);
    if (resolvedIcon && typeof resolvedIcon.isEmpty === 'function' && !resolvedIcon.isEmpty()) {
      return resolvedIcon;
    }
    warn(`[Main] Tray icon path was empty or unreadable: ${iconPath}`);
  }
  return nativeImage.createFromDataURL(TRAY_ICON_FALLBACK_DATA_URL);
}

function resolveAppIconNativeImage({
  resolveAppIconPath = resolveAppIconPathRuntime,
  warn = console.warn,
} = {}) {
  const iconPath = resolveAppIconPath();
  if (!iconPath || typeof nativeImage.createFromPath !== 'function') {
    return null;
  }
  const resolvedIcon = nativeImage.createFromPath(iconPath);
  if (resolvedIcon && typeof resolvedIcon.isEmpty === 'function' && !resolvedIcon.isEmpty()) {
    return resolvedIcon;
  }
  warn(`[Main] App icon path was empty or unreadable: ${iconPath}`);
  return null;
}

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

function loadRendererView({
  targetWindow,
  view,
  app,
  path,
  vmMode = false,
  enableDevTransparencyUi = false,
  enableDebugStreamTrace = false,
  enableDebugToolScreenshot = false,
}) {
  const query = {};
  if (view) {
    query.view = view;
  }
  if (vmMode) {
    query.vm_mode = '1';
  }
  if (enableDevTransparencyUi) {
    query.dev_ui = '1';
  }
  if (enableDebugStreamTrace) {
    query.debug_stream = '1';
  }
  if (enableDebugToolScreenshot) {
    query.debug_tool_screenshot = '1';
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
  icon = null,
  allowDevTools = false,
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
      devTools: Boolean(allowDevTools),
    },
  };
  if (icon) {
    windowOptions.icon = icon;
  }
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

  let chatRendererLoaded = false;
  const ensureChatRendererLoaded = () => {
    if (chatRendererLoaded) {
      return;
    }
    chatRendererLoaded = true;
    loadRendererView({
      targetWindow: chatWindow,
      view: 'chatbox',
      app,
      path,
      enableDevTransparencyUi,
      enableDebugStreamTrace,
      enableDebugToolScreenshot,
    });
  };

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

  let responseRendererLoaded = false;
  const ensureResponseRendererLoaded = () => {
    if (responseRendererLoaded) {
      return;
    }
    responseRendererLoaded = true;
    loadRendererView({
      targetWindow: responseWindow,
      view: enableOsToolGhostDebug ? responseWindowDebugView : 'chatbox-response',
      app,
      path,
      enableDevTransparencyUi,
      enableDebugStreamTrace,
      enableDebugToolScreenshot,
    });
  };

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
