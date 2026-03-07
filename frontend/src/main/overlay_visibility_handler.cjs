function handleShowMainWindow(options = {}, deps = {}) {
  const {
    showMainWindow,
    resolveTargetDisplayAffinity = () => null,
  } = deps;
  try {
    const maximize = options?.maximize === true;
    return showMainWindow({
      focus: true,
      maximize,
      targetDisplayAffinity: resolveTargetDisplayAffinity(options),
    });
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
  const focus = options?.focus !== false;
  return showChatWindow({
    focus,
    targetDisplayAffinity: resolveTargetDisplayAffinity(options),
  });
}

function handleHideChatbox(deps = {}) {
  const { hideChatWindow } = deps;
  return hideChatWindow();
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

async function handlePrepareChatboxForScreenshot(
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
  handlePrepareChatboxForScreenshot,
  resolveHiddenSurfaceForScreenshot,
  handleShowChatbox,
  handleShowMainWindow,
};
