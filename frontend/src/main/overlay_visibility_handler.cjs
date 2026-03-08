const {
  normalizeChatSurfaceWindowOptions,
  normalizeMainSurfaceWindowOptions,
} = require('./surface_window_options_runtime.cjs');

function handleShowMainWindow(options = {}, deps = {}) {
  const {
    showMainWindow,
    resolveTargetDisplayAffinity = () => null,
  } = deps;
  try {
    return showMainWindow(normalizeMainSurfaceWindowOptions({
      ...options,
      focus: true,
      targetDisplayAffinity: resolveTargetDisplayAffinity(options),
    }));
  } catch (error) {
    return { success: false, reason: `Failed to show main window: ${error.message}` };
  }
}

function handleShowChatbox(
  options = {},
  deps = {},
) {
  const {
    showChatWindow,
    resolveTargetDisplayAffinity = () => null,
  } = deps;
  return showChatWindow(normalizeChatSurfaceWindowOptions({
    ...options,
    targetDisplayAffinity: resolveTargetDisplayAffinity(options),
  }));
}

function handleHideChatbox(deps = {}) {
  const { hideChatWindow } = deps;
  return hideChatWindow();
}

function handleHandoffSurfaceForComputerUse(options = {}, deps = {}) {
  const {
    getWindows = () => ({}),
    showChatWindow,
  } = deps;
  const { mainWindow } = getWindows();
  const mainVisible = Boolean(
    mainWindow
    && typeof mainWindow.isDestroyed === 'function'
    && !mainWindow.isDestroyed()
    && typeof mainWindow.isVisible === 'function'
    && mainWindow.isVisible()
  );

  if (!mainVisible) {
    return { success: true, handedOff: false, surface: 'none' };
  }

  const result = showChatWindow(normalizeChatSurfaceWindowOptions({
    ...options,
    focus: false,
    restoreResponseOverlay: true,
  }));
  return {
    ...result,
    handedOff: Boolean(result?.success),
    surface: result?.success ? 'chatbox' : 'none',
  };
}

function handleRestoreSurfaceAfterScreenshot(options = {}, deps = {}) {
  const {
    showChatWindow,
    showMainWindow,
  } = deps;
  const hiddenSurface = typeof options?.hiddenSurface === 'string'
    ? options.hiddenSurface
    : 'none';

  if (hiddenSurface === 'chatbox') {
    return showChatWindow(normalizeChatSurfaceWindowOptions({
      focus: false,
      restoreResponseOverlay: true,
    }));
  }
  if (hiddenSurface === 'main-window') {
    return showMainWindow(normalizeMainSurfaceWindowOptions({ focus: false }));
  }
  return { success: true, restored: false };
}

function isUsableWindow(targetWindow) {
  return Boolean(
    targetWindow
    && typeof targetWindow === 'object'
    && !(typeof targetWindow.isDestroyed === 'function' && targetWindow.isDestroyed())
  );
}

function isVisibleWindow(targetWindow) {
  return Boolean(
    isUsableWindow(targetWindow)
    && typeof targetWindow.isVisible === 'function'
    && targetWindow.isVisible()
  );
}

function windowOwnsWebContents(targetWindow, webContents) {
  return Boolean(
    isUsableWindow(targetWindow)
    && webContents
    && targetWindow.webContents === webContents
  );
}

function resolveHiddenSurfaceForScreenshot(event = {}, deps = {}) {
  const { getWindows = () => ({}) } = deps;
  const { mainWindow, chatWindow } = getWindows();
  const senderWebContents = event?.sender || null;

  if (windowOwnsWebContents(mainWindow, senderWebContents) && isVisibleWindow(mainWindow)) {
    return 'main-window';
  }
  if (windowOwnsWebContents(chatWindow, senderWebContents) && isVisibleWindow(chatWindow)) {
    return 'chatbox';
  }
  if (isVisibleWindow(mainWindow)) {
    return 'main-window';
  }
  if (isVisibleWindow(chatWindow)) {
    return 'chatbox';
  }
  return 'none';
}

async function handlePrepareSurfaceForScreenshot(
  event = null,
  options = {},
  deps = {},
) {
  const {
    hideChatWindow,
    hideMainWindow,
    waitInMain = (waitMs) => new Promise((resolve) => setTimeout(resolve, waitMs)),
  } = deps;
  const waitMs = (
    typeof options?.waitMs === 'number' && Number.isFinite(options.waitMs)
      ? Math.max(0, options.waitMs)
      : 0
  );
  const settleMs = (
    typeof options?.settleMs === 'number' && Number.isFinite(options.settleMs)
      ? Math.max(0, options.settleMs)
      : 120
  );
  const hideSurface = options?.hideSurface !== false;
  const hiddenSurface = hideSurface
    ? resolveHiddenSurfaceForScreenshot(event, deps)
    : 'none';

  const waitStartTime = performance.now();
  await waitInMain(waitMs);
  const waitTime = (performance.now() - waitStartTime) / 1000;

  let hideResult = { success: true };
  let hideInvokeTime = 0;
  if (hiddenSurface !== 'none') {
    const hideStartTime = performance.now();
    hideResult = hiddenSurface === 'main-window'
      ? await hideMainWindow({ suppressForScreenshot: true })
      : hideChatWindow();
    hideInvokeTime = (performance.now() - hideStartTime) / 1000;
    if (!hideResult?.success) {
      return hideResult;
    }
  }

  let settleTime = 0;
  if (hiddenSurface !== 'none') {
    const settleStartTime = performance.now();
    await waitInMain(settleMs);
    settleTime = (performance.now() - settleStartTime) / 1000;
  }
  return {
    ...hideResult,
    waitMs,
    settleMs,
    hideSurface,
    hiddenSurface,
    waitTime,
    hideInvokeTime,
    settleTime,
  };
}

module.exports = {
  handleHideChatbox,
  handleHandoffSurfaceForComputerUse,
  handlePrepareSurfaceForScreenshot,
  handleRestoreSurfaceAfterScreenshot,
  handleShowChatbox,
  handleShowMainWindow,
};
