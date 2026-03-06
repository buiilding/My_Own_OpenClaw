const { registerOverlayRendererWindows } = require('./overlay_renderer_registration.cjs');

function toMb(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Number((value / (1024 * 1024)).toFixed(1));
}

function summarizeElectronAppMetrics(metrics = []) {
  const summary = {
    processes: 0,
    browser: 0,
    renderer: 0,
    gpu: 0,
    utility: 0,
    totalWorkingSetMb: null,
  };
  if (!Array.isArray(metrics)) {
    return summary;
  }

  let totalWorkingSetBytes = 0;
  summary.processes = metrics.length;
  metrics.forEach((metric) => {
    const type = String(metric?.type || '').toLowerCase();
    if (type === 'browser') {
      summary.browser += 1;
    } else if (type === 'renderer' || type === 'tab') {
      summary.renderer += 1;
    } else if (type === 'gpu') {
      summary.gpu += 1;
    } else if (type === 'utility') {
      summary.utility += 1;
    }

    const workingSetSize = Number(metric?.memory?.workingSetSize);
    if (Number.isFinite(workingSetSize)) {
      totalWorkingSetBytes += workingSetSize;
    }
  });
  summary.totalWorkingSetMb = toMb(totalWorkingSetBytes);
  return summary;
}

function logStartupMetricsSnapshot(label, deps = {}) {
  const {
    log = console.log,
    getPid = () => process.pid,
    getProcessMemoryUsage = () => process.memoryUsage(),
    getAppMetrics = () => [],
  } = deps;

  let memoryUsage = {};
  let appMetrics = [];
  try {
    memoryUsage = getProcessMemoryUsage() || {};
  } catch (_error) {
    memoryUsage = {};
  }
  try {
    appMetrics = getAppMetrics() || [];
  } catch (_error) {
    appMetrics = [];
  }

  const summary = summarizeElectronAppMetrics(appMetrics);
  const pid = Number(getPid?.()) || process.pid;
  const rssMb = toMb(Number(memoryUsage?.rss));
  const heapUsedMb = toMb(Number(memoryUsage?.heapUsed));
  const workingSetMb = summary.totalWorkingSetMb ?? 'n/a';
  log(
    `[Main][StartupMetrics] ${label} pid=${pid} rss_mb=${rssMb ?? 'n/a'} ` +
      `heap_used_mb=${heapUsedMb ?? 'n/a'} app_processes=${summary.processes} ` +
      `browser=${summary.browser} renderer=${summary.renderer} gpu=${summary.gpu} ` +
      `utility=${summary.utility} app_working_set_mb=${workingSetMb}`,
  );
}

function buildWakewordHotkeyCandidates(wakewordHotkey, platform = process.platform) {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(wakewordHotkey);

  if (platform === 'win32') {
    // Keep Win-key-free options to avoid OS-reserved accelerator conflicts.
    pushCandidate('CommandOrControl+Alt+W');
    pushCandidate('CommandOrControl+Shift+W');
    pushCandidate('CommandOrControl+Alt+J');
  }

  return candidates;
}

function initializeMainProcessLifecycleRuntime(deps = {}) {
  const {
    app,
    BrowserWindow,
    globalShortcut,
    screen,
    registerRendererWindow,
    wakewordHotkey,
    platform = process.platform,
    vmMode = false,
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
    stopVmWorker = () => {},
    log = console.log,
    warn = console.warn,
    scheduleTimeout = (fn, ms) => setTimeout(fn, ms),
    getPid = () => process.pid,
    getProcessMemoryUsage = () => process.memoryUsage(),
    getAppMetrics = () => {
      if (typeof app?.getAppMetrics === 'function') {
        return app.getAppMetrics();
      }
      return [];
    },
    now = () => Date.now(),
    secondInstanceFocusCooldownMs = 1000,
    requestSingleInstanceLock = () => {
      if (typeof app?.requestSingleInstanceLock === 'function') {
        return app.requestSingleInstanceLock();
      }
      return true;
    },
    quitApp = () => {
      app.quit();
    },
  } = deps;

  const singleInstanceLockAcquired = requestSingleInstanceLock();
  if (!singleInstanceLockAcquired) {
    log('[Main] Existing instance detected, exiting duplicate process.');
    quitApp();
    return;
  }

  let lastSecondInstanceFocusAt = null;
  const focusCooldownMs = Math.max(0, Number(secondInstanceFocusCooldownMs) || 0);
  app.on('second-instance', () => {
    const currentTime = Number(now?.());
    const focusTimestamp = Number.isFinite(currentTime) ? currentTime : Date.now();
    if (
      focusCooldownMs > 0 &&
      Number.isFinite(lastSecondInstanceFocusAt) &&
      focusTimestamp - lastSecondInstanceFocusAt < focusCooldownMs
    ) {
      log('[Main][StartupMetrics] second-instance event throttled; skip focus to avoid loop.');
      return;
    }
    lastSecondInstanceFocusAt = focusTimestamp;
    log('[Main][StartupMetrics] second-instance event received; focusing existing window.');
    showMainWindow({ focus: true });
  });

  app.whenReady().then(() => {
    createWindow();
    let chatOverlay = null;
    let responseOverlay = null;
    if (!vmMode) {
      chatOverlay = createChatWindow();
      responseOverlay = createResponseWindow();
      createTray();
    }
    // First launch should present the dashboard immediately. Tray/pill mode
    // still applies after close via existing close-handler behavior.
    showMainWindow({ focus: true });
    if (!vmMode) {
      syncWakewordToggleForChatVisibility();

      registerOverlayRendererWindows(
        [chatOverlay || getChatWindow(), responseOverlay || getResponseWindow()],
        { registerRendererWindow },
      );

      screen.on('display-metrics-changed', () => {
        positionChatWindow();
        positionResponseWindow();
      });

      const shortcutHandler = () => {
        const chatWindow = getChatWindow();
        if (!chatWindow || chatWindow.isDestroyed()) {
          return;
        }
        if (chatWindow.isVisible()) {
          hideChatWindow();
        } else {
          showChatWindow({ focus: true });
        }
      };

      const hotkeyCandidates = buildWakewordHotkeyCandidates(wakewordHotkey, platform);
      let registeredHotkey = null;
      for (const candidate of hotkeyCandidates) {
        const registered = globalShortcut.register(candidate, shortcutHandler);
        if (!registered) {
          continue;
        }
        registeredHotkey = candidate;
        break;
      }

      if (!registeredHotkey) {
        warn(`[Main] Failed to register global shortcut. Tried: ${hotkeyCandidates.join(', ')}`);
      } else if (registeredHotkey !== wakewordHotkey) {
        warn(
          `[Main] Registered fallback global shortcut: ${registeredHotkey} ` +
          `(primary ${wakewordHotkey} unavailable)`,
        );
      }
    }

    logStartupMetricsSnapshot('startup-ready', {
      log,
      getPid,
      getProcessMemoryUsage,
      getAppMetrics,
    });
    scheduleTimeout(() => {
      logStartupMetricsSnapshot('startup-ready+2000ms', {
        log,
        getPid,
        getProcessMemoryUsage,
        getAppMetrics,
      });
    }, 2000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        if (!vmMode) {
          const chatOverlay = createChatWindow();
          const responseOverlay = createResponseWindow();
          registerOverlayRendererWindows(
            [chatOverlay, responseOverlay],
            { registerRendererWindow },
          );
        }
      } else {
        showMainWindow({ focus: true });
      }
    });
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    log('[Main] App quitting, cleaning up subprocesses...');
    stopLocalBackend();
    stopVmWorker();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', (event) => {
    if (!app.isQuitting && !vmMode) {
      event.preventDefault();
    }
  });
}

module.exports = {
  initializeMainProcessLifecycleRuntime,
};
