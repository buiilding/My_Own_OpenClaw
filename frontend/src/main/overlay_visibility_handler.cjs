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

async function handlePrepareChatboxForScreenshot(
  options = {},
  deps = {},
) {
  const {
    hideChatWindow,
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
  const hideChatbox = options?.hideChatbox !== false;

  const waitStartTime = performance.now();
  await waitInMain(waitMs);
  const waitTime = (performance.now() - waitStartTime) / 1000;

  let hideResult = { success: true };
  let hideInvokeTime = 0;
  if (hideChatbox) {
    const hideStartTime = performance.now();
    hideResult = hideChatWindow();
    hideInvokeTime = (performance.now() - hideStartTime) / 1000;
    if (!hideResult?.success) {
      return hideResult;
    }
  }

  const settleStartTime = performance.now();
  await waitInMain(settleMs);
  const settleTime = (performance.now() - settleStartTime) / 1000;
  return {
    ...hideResult,
    waitMs,
    settleMs,
    hideChatbox,
    waitTime,
    hideInvokeTime,
    settleTime,
  };
}

module.exports = {
  handleHideChatbox,
  handlePrepareChatboxForScreenshot,
  handleShowChatbox,
  handleShowMainWindow,
};
