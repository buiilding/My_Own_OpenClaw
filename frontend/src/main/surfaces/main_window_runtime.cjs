/**
 * Coordinates the main window runtime for the Electron main process.
 */

const {
  resolveAppIconNativeImage,
  resolveAppIconPathRuntime,
  resolveTrayIconNativeImage,
} = require('./main_window_icon_runtime.cjs');
const {
  attachRendererConsoleLogging,
  createLazyRendererViewLoader,
  createOverlayBrowserWindow,
  loadRendererView,
} = require('./main_window_overlay_runtime.cjs');
const {
  buildPreloadIpcChannelsArgument,
} = require('../ipc/ipc_channel_registry_runtime.cjs');
const {
  createWindowPlatformPolicy,
} = require('./window_platform_policy.cjs');
const {
  getInstallAuthStatePath,
} = require('../ipc/ipc_install_auth_state.cjs');

const CHATBOX_OVERLAY_FIXED_WIDTH = 520;
const CHATBOX_OVERLAY_FIXED_HEIGHT = 164;
const DEFAULT_OVERLAY_QUERY_CAPTURE_FOCUS_WAIT_MS = 120;
const PENDING_COLLAPSE_TO_CHAT_PILL_KEY = '__desktopAgentPendingCollapseToChatPill';

function normalizeOverlayQueryCaptureFocusWaitMs(value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return DEFAULT_OVERLAY_QUERY_CAPTURE_FOCUS_WAIT_MS;
  }
  if (typeof value === 'string' && !value.trim()) {
    return DEFAULT_OVERLAY_QUERY_CAPTURE_FOCUS_WAIT_MS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_OVERLAY_QUERY_CAPTURE_FOCUS_WAIT_MS;
  }
  return Math.round(parsed);
}

async function prepareOverlayQueryCaptureFocus({
  chatWindow,
  responseWindow,
  mainWindow,
  platform = process.platform,
  waitMs = DEFAULT_OVERLAY_QUERY_CAPTURE_FOCUS_WAIT_MS,
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

  const normalizedWaitMs = normalizeOverlayQueryCaptureFocusWaitMs(waitMs);
  if (normalizedWaitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, normalizedWaitMs));
  }

  return {
    restoredExternalFocus: false,
    demotedOverlayFocus: false,
    externalFocusActive: false,
    canVerifyExternalFocus: false,
  };
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

function collapseMainWindowToChatPill({
  mainWindow,
  showChatWindow,
  platform = process.platform,
  leaveFullScreenTimeoutMs = 1500,
}) {
  const finishCollapse = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.hide();
    showChatWindow({ focus: true, reason: 'dashboard-close' });
  };

  const shouldExitFullscreenFirst = (
    platform === 'darwin'
    && typeof mainWindow?.isFullScreen === 'function'
    && mainWindow.isFullScreen()
    && typeof mainWindow.setFullScreen === 'function'
    && typeof mainWindow.once === 'function'
  );

  if (!shouldExitFullscreenFirst) {
    finishCollapse();
    return;
  }

  if (mainWindow[PENDING_COLLAPSE_TO_CHAT_PILL_KEY]) {
    return;
  }

  mainWindow[PENDING_COLLAPSE_TO_CHAT_PILL_KEY] = true;
  let settled = false;
  let timeoutId = null;
  const finishPendingCollapse = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    mainWindow[PENDING_COLLAPSE_TO_CHAT_PILL_KEY] = false;
    finishCollapse();
  };
  try {
    timeoutId = setTimeout(finishPendingCollapse, leaveFullScreenTimeoutMs);
    mainWindow.once('leave-full-screen', finishPendingCollapse);
    mainWindow.setFullScreen(false);
  } catch (_error) {
    finishPendingCollapse();
  }
}

function hideMainWindowWithoutChatPill({
  mainWindow,
}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.hide();
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
  localToolLifecycle = null,
  syncSdkLiveTurnSurfaceIntent = null,
  initializeWakewordBridge,
  showChatWindow,
  emitWakewordSttTrigger,
  initializeLocalBackendBridge,
  getKnownLocalRuntime = null,
  ensureLocalRuntime = null,
  permissionStatePath = null,
  initializeMainProcessIpc,
  getWindows,
  getMainWindowMode = () => 'dashboard',
  setMainWindow,
  syncWindowDisplayAffinity = () => {},
  mainHostSkin = {},
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  log = console.log,
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
      preload: path.join(__dirname, '../../preload.js'),
      additionalArguments: [buildPreloadIpcChannelsArgument()],
      contextIsolation: true,
      nodeIntegration: false,
      devTools: allowDevTools,
    },
    ...(appIcon ? { icon: appIcon } : {}),
  });

  setMainWindow(mainWindow);
  attachRendererConsoleLogging({
    targetWindow: mainWindow,
    view: 'main',
    logPrefix: mainHostSkin?.identity?.logPrefix,
  });
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
    localToolLifecycle,
    syncSdkLiveTurnSurfaceIntent,
    isPackaged: app.isPackaged,
    permissionStatePath,
    authStatePath: getInstallAuthStatePath(),
    getWindows,
  });
  initializeWakewordBridge(mainWindow, () => {
    const result = showChatWindow({ focus: true, reason: 'wakeword' });
    if (result?.success) {
      emitWakewordSttTrigger();
    }
  }, {
    bundledRuntimeCopy: mainHostSkin?.bundledRuntime,
  });
  initializeLocalBackendBridge(getWindows, {
    getKnownLocalRuntime,
    ensureLocalRuntime,
    isPackaged: app.isPackaged,
    permissionStatePath,
    authStatePath: getInstallAuthStatePath(),
    mainHostSkin,
  });
  initializeMainProcessIpc();

  if (platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.on('close', (event) => {
    const mainWindowMode = typeof getMainWindowMode === 'function'
      ? getMainWindowMode()
      : 'dashboard';
    log(`[Main][Window] close_requested name=main mode=${mainWindowMode} minimizing=${Boolean(minimizeToTrayOnClose && !app.isQuitting)}`);

    if (!app.isQuitting && mainWindowMode === 'onboarding') {
      event.preventDefault();
      hideMainWindowWithoutChatPill({
        mainWindow,
      });
      return false;
    }

    if (minimizeToTrayOnClose && !app.isQuitting) {
      event.preventDefault();
      collapseMainWindowToChatPill({
        mainWindow,
        showChatWindow,
        platform,
      });
      return false;
    }
    return undefined;
  });

  mainWindow.on('closed', () => {
    log('[Main][Window] closed name=main');
    setMainWindow(null);
  });

  mainWindow.on('show', () => {
    log('[Main][Window] shown name=main');
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
  mainHostSkin = {},
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  log = console.log,
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
  attachRendererConsoleLogging({
    targetWindow: chatWindow,
    view: 'chat-pill',
    logPrefix: mainHostSkin?.identity?.logPrefix,
  });
  applyOverlayPolicy({
    targetWindow: chatWindow,
    windowLabel: 'chat box',
  });
  chatWindow.setIgnoreMouseEvents(true, { forward: true });
  positionChatWindow();

  const ensureChatRendererLoaded = createLazyRendererViewLoader({
    targetWindow: chatWindow,
    view: 'minimal-chat-pill',
    app,
    path,
    enableDevTransparencyUi,
    enableDebugStreamTrace,
    enableDebugToolScreenshot,
  });

  chatWindow.on('close', (event) => {
    log(`[Main][Window] close_requested name=chat-pill quitting=${Boolean(app.isQuitting)}`);
    if (!app.isQuitting) {
      event.preventDefault();
      hideChatWindow({ reason: 'user' });
    }
    return false;
  });

  chatWindow.on('closed', () => {
    log('[Main][Window] closed name=chat-pill');
    setChatWindow(null);
  });

  chatWindow.on('show', () => {
    log('[Main][Window] shown name=chat-pill');
    ensureChatRendererLoaded();
    syncWindowDisplayAffinity(chatWindow);
    syncWakewordToggleForChatVisibility();
  });

  chatWindow.on('hide', () => {
    log('[Main][Window] hidden name=chat-pill');
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
  mainHostSkin = {},
  resolveAppIconPath = resolveAppIconPathRuntime,
  resolveAppIcon = resolveAppIconNativeImage,
  log = console.log,
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
  attachRendererConsoleLogging({
    targetWindow: responseWindow,
    view: enableOsToolGhostDebug ? responseWindowDebugView : 'response-overlay',
    logPrefix: mainHostSkin?.identity?.logPrefix,
  });
  applyOverlayPolicy({
    targetWindow: responseWindow,
    windowLabel: 'response overlay',
  });
  responseWindow.setIgnoreMouseEvents(true, { forward: true });

  const ensureResponseRendererLoaded = createLazyRendererViewLoader({
    targetWindow: responseWindow,
    view: enableOsToolGhostDebug ? responseWindowDebugView : 'minimal-response-overlay',
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
    log('[Main][Window] shown name=response-overlay');
    ensureResponseRendererLoaded();
  });

  responseWindow.on('close', (event) => {
    log(`[Main][Window] close_requested name=response-overlay quitting=${Boolean(app.isQuitting)}`);
    if (!app.isQuitting) {
      event.preventDefault();
      setResponseOverlayVisibilityState(false);
      responseWindow.hide();
    }
    return false;
  });

  responseWindow.on('closed', () => {
    log('[Main][Window] closed name=response-overlay');
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
  mainHostSkin = {},
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
        showMainWindow({ focus: true, reason: 'tray-show-app' });
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

  tray.setToolTip(mainHostSkin?.identity?.trayTooltip || 'Desktop agent');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    showMainWindow({ focus: true, reason: 'tray-double-click' });
  });

  return tray;
}

module.exports = {
  createChatWindow,
  createMainWindow,
  createResponseWindow,
  createTray,
  emitMainWindowOpenTarget,
  normalizeMainWindowOpenTarget,
  prepareOverlayQueryCaptureFocus,
};
