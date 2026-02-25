function handleShowMainWindow(deps = {}) {
  const { showMainWindow } = deps;
  try {
    return showMainWindow({ focus: true });
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

module.exports = {
  handleHideChatbox,
  handleShowChatbox,
  handleShowMainWindow,
};
