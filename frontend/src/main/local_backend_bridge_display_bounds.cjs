function resolveScreenshotToolDisplayBounds({
  BrowserWindow,
  screen,
  webContents,
  resolveChatWindow,
  resolveMainWindow,
  resolveActiveSurfaceDisplayAffinity,
  toScreenshotDisplayBounds,
}) {
  const displayAffinity = resolveActiveSurfaceDisplayAffinity({
    BrowserWindow,
    screen,
    webContents,
    chatWindow: typeof resolveChatWindow === 'function' ? resolveChatWindow() : null,
    mainWindow: typeof resolveMainWindow === 'function' ? resolveMainWindow() : null,
  });
  return toScreenshotDisplayBounds(displayAffinity);
}

module.exports = {
  resolveScreenshotToolDisplayBounds,
};
