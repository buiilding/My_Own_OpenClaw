function resolveScreenshotToolDisplayBounds({
  BrowserWindow,
  screen,
  webContents,
  resolveChatWindow,
  resolveMainWindow,
  resolveActiveSurfaceDisplayAffinityForWindows,
  getActiveDisplayAffinity = () => null,
  toScreenshotDisplayBounds,
}) {
  const displayAffinity = resolveActiveSurfaceDisplayAffinityForWindows({
    BrowserWindow,
    screen,
    webContents,
    getWindows: () => ({
      chatWindow: typeof resolveChatWindow === 'function' ? resolveChatWindow() : null,
      mainWindow: typeof resolveMainWindow === 'function' ? resolveMainWindow() : null,
    }),
    getActiveDisplayAffinity,
  });
  return toScreenshotDisplayBounds(displayAffinity);
}

module.exports = {
  resolveScreenshotToolDisplayBounds,
};
