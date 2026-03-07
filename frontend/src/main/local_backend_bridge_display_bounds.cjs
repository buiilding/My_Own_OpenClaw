function resolveScreenshotToolDisplayBounds({
  BrowserWindow,
  screen,
  webContents,
  getActiveDisplayAffinity,
  resolveDisplayAffinityForWebContents,
  toScreenshotDisplayBounds,
}) {
  const visibleSenderDisplayAffinity = resolveDisplayAffinityForWebContents({
    BrowserWindow,
    screen,
    webContents: webContents || null,
    requireVisible: true,
  });

  return toScreenshotDisplayBounds(
    visibleSenderDisplayAffinity || getActiveDisplayAffinity(),
  );
}

module.exports = {
  resolveScreenshotToolDisplayBounds,
};
