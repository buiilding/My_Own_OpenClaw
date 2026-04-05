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
const {
  buildPreloadIpcChannelsArgument,
} = require('./ipc_channel_registry_runtime.cjs');
const {
  createWindowPlatformPolicy,
} = require('./window_platform_policy.cjs');

const CHATBOX_OVERLAY_FIXED_WIDTH = 520;
const CHATBOX_OVERLAY_FIXED_HEIGHT = 70;

async function prepareOverlayQueryCaptureFocus({
  chatWindow,
  responseWindow,
  mainWindow,
  platform = process.platform,
  waitMs = 120,
}) {
  if (platform === 'darwin') {
    return {
      restoredExternalFocus: false,
      demotedOverlayFocus: false,
      externalFocusActive: false,
      canVerifyExternalFocus: false,
    };
  }

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
  const policy = createWindowPlatformPolicy({
    platform,
    warn,
  });
  policy.applyContentProtection({
    targetWindow,
    windowLabel,
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
  setAgentLoopStopShortcutEnabled,
  setGlobalAgentStopShortcutAccelerator,
  prepareOverlayQueryCaptureFocus,
  initializeWakewordBridge,
  showChatWindow,
  emitWakewordSttTrigger,
  initializeLocalBackendBridge,
  permissionStatePath = null,
  initializeMainProcessIpc,
  getLatestFrontendConfig,
  getWindows,
  setMainWindow,
  syncWindowDisplayAffinity = () => {},
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
      additionalArguments: [buildPreloadIpcChannelsArgument()],
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
    setAgentLoopStopShortcutEnabled,
    setGlobalAgentStopShortcutAccelerator,
    isPackaged: app.isPackaged,
    getWindows,
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
    permissionStatePath,
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

  mainWindow.on('show', () => {
    syncWindowDisplayAffinity(mainWindow);
  });

  mainWindow.on('move', () => {
    syncWindowDisplayAffinity(mainWindow);
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
  setChatWindow,
  applyOverlayWindowPolicy = null,
  syncWindowDisplayAffinity = () => {},
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  warn = console.warn,
}) {
  const applyOverlayPolicy = typeof applyOverlayWindowPolicy === 'function'
    ? applyOverlayWindowPolicy
    : createWindowPlatformPolicy({ platform, warn }).applyOverlayWindowPolicy;
  const appIcon = resolveAppIcon({
    resolveAppIconPath,
    warn,
  });
  const chatWindow = createOverlayBrowserWindow({
    BrowserWindow,
    path,
    platform,
    width: CHATBOX_OVERLAY_FIXED_WIDTH,
    height: CHATBOX_OVERLAY_FIXED_HEIGHT,
    icon: appIcon,
    allowDevTools: Boolean(enableDevTransparencyUi),
  });
  setChatWindow(chatWindow);
  applyOverlayPolicy({
    targetWindow: chatWindow,
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
    syncWindowDisplayAffinity(chatWindow);
    syncWakewordToggleForChatVisibility();
  });

  chatWindow.on('hide', () => {
    syncWakewordToggleForChatVisibility();
  });

  chatWindow.on('move', () => {
    syncWindowDisplayAffinity(chatWindow);
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
  applyOverlayWindowPolicy = null,
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  warn = console.warn,
}) {
  const applyOverlayPolicy = typeof applyOverlayWindowPolicy === 'function'
    ? applyOverlayWindowPolicy
    : createWindowPlatformPolicy({ platform, warn }).applyOverlayWindowPolicy;
  const appIcon = resolveAppIcon({
    resolveAppIconPath,
    warn,
  });
  const responseWindow = createOverlayBrowserWindow({
    BrowserWindow,
    path,
    platform,
    width: 520,
    height: enableOsToolGhostDebug ? 620 : 1,
    show: enableOsToolGhostDebug,
    icon: appIcon,
    allowDevTools: Boolean(enableDevTransparencyUi),
  });
  setResponseWindow(responseWindow);
  applyOverlayPolicy({
    targetWindow: responseWindow,
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

  ensureResponseRendererLoaded();

  if (enableOsToolGhostDebug) {
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
