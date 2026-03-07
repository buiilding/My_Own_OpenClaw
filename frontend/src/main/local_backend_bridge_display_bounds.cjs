function resolveScreenshotToolDisplayBounds({
  BrowserWindow,
  screen,
  webContents,
  resolveChatWindow,
  resolveMainWindow,
  resolveResponseWindow,
  getActiveDisplayAffinity,
  resolveDisplayAffinityForWindow,
  resolveDisplayAffinityForWebContents,
  toScreenshotDisplayBounds,
}) {
  const chatWindow = typeof resolveChatWindow === 'function' ? resolveChatWindow() : null;
  const mainWindow = typeof resolveMainWindow === 'function' ? resolveMainWindow() : null;
  const responseWindow = typeof resolveResponseWindow === 'function' ? resolveResponseWindow() : null;
  const visibleSenderDisplayAffinity = resolveDisplayAffinityForWebContents({
    BrowserWindow,
    screen,
    webContents: webContents || null,
    requireVisible: true,
  });
  const visibleChatDisplayAffinity = chatWindow
    ? resolveDisplayAffinityForWindow(screen, chatWindow, { requireVisible: true })
    : null;
  const visibleMainDisplayAffinity = mainWindow
    ? resolveDisplayAffinityForWindow(screen, mainWindow, { requireVisible: true })
    : null;
  const visibleResponseDisplayAffinity = responseWindow
    ? resolveDisplayAffinityForWindow(screen, responseWindow, { requireVisible: true })
    : null;

  return toScreenshotDisplayBounds(
    visibleSenderDisplayAffinity
      || visibleChatDisplayAffinity
      || visibleMainDisplayAffinity
      || visibleResponseDisplayAffinity
      || getActiveDisplayAffinity(),
  );
}

module.exports = {
  resolveScreenshotToolDisplayBounds,
};
