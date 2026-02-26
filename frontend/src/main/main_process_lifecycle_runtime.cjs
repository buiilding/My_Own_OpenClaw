const { registerOverlayRendererWindows } = require('./overlay_renderer_registration.cjs');

function initializeMainProcessLifecycleRuntime(deps = {}) {
  const {
    app,
    BrowserWindow,
    globalShortcut,
    screen,
    registerRendererWindow,
    wakewordHotkey,
    createWindow,
    createChatWindow,
    createResponseWindow,
    createTray,
    syncWakewordToggleForChatVisibility,
    positionChatWindow,
    positionResponseWindow,
    hideChatWindow,
    showChatWindow,
    showMainWindow,
    getChatWindow = () => null,
    getResponseWindow = () => null,
    stopLocalBackend,
    log = console.log,
    warn = console.warn,
  } = deps;

  app.whenReady().then(() => {
    createWindow();
    createChatWindow();
    createResponseWindow();
    createTray();
    syncWakewordToggleForChatVisibility();

    registerOverlayRendererWindows(
      [getChatWindow(), getResponseWindow()],
      { registerRendererWindow },
    );

    screen.on('display-metrics-changed', () => {
      positionChatWindow();
      positionResponseWindow();
    });

    const registered = globalShortcut.register(wakewordHotkey, () => {
      const chatWindow = getChatWindow();
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
      warn(`[Main] Failed to register global shortcut: ${wakewordHotkey}`);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        const chatOverlay = createChatWindow();
        const responseOverlay = createResponseWindow();
        registerOverlayRendererWindows(
          [chatOverlay, responseOverlay],
          { registerRendererWindow },
        );
      } else {
        showMainWindow({ focus: true });
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    log('[Main] App quitting, cleaning up subprocesses...');
    stopLocalBackend();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });
}

module.exports = {
  initializeMainProcessLifecycleRuntime,
};
