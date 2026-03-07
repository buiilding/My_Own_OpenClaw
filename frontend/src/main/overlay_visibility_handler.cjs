function handleShowMainWindow(options = {}, deps = {}) {
  const { showMainWindow } = deps;
  try {
    const maximize = options?.maximize === true;
    return showMainWindow({ focus: true, maximize });
  } catch (error) {
    return { success: false, reason: `Failed to show main window: ${error.message}` };
  }
}

function handleShowChatbox(
  options = {},
  deps = {},
) {
  const { showChatWindow } = deps;
  const focus = options?.focus !== false;
  return showChatWindow({ focus });
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
    waitForSettlement = (waitMs) => new Promise((resolve) => setTimeout(resolve, waitMs)),
  } = deps;
  const settleMs = (
    typeof options?.settleMs === 'number' && Number.isFinite(options.settleMs)
      ? Math.max(0, options.settleMs)
      : 120
  );

  const hideResult = hideChatWindow();
  if (!hideResult?.success) {
    return hideResult;
  }

  await waitForSettlement(settleMs);
  return {
    ...hideResult,
    settleMs,
  };
}

module.exports = {
  handleHideChatbox,
  handlePrepareChatboxForScreenshot,
  handleShowChatbox,
  handleShowMainWindow,
};
