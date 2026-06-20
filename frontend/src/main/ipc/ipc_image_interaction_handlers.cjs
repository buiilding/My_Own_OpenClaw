/**
 * Registers image-related IPC handlers for Electron main.
 */

function buildTrustedImageOrigins({
  getBackendHttpUrl,
  getBackendCandidates,
} = {}) {
  const origins = [];
  const backendHttpUrl = typeof getBackendHttpUrl === 'function'
    ? getBackendHttpUrl()
    : null;
  if (backendHttpUrl) {
    origins.push(backendHttpUrl);
  }

  const candidates = typeof getBackendCandidates === 'function'
    ? getBackendCandidates()
    : [];
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (candidate?.httpUrl) {
        origins.push(candidate.httpUrl);
      }
    }
  }

  return origins;
}

function registerImageInteractionHandlers({
  ipcMain,
  Menu,
  BrowserWindow,
  clipboard,
  nativeImage,
  registerClipboardImageHandler,
  registerImageContextMenuHandler,
  getBackendHttpUrl,
  getBackendCandidates,
} = {}) {
  const getTrustedImageOrigins = () => buildTrustedImageOrigins({
    getBackendHttpUrl,
    getBackendCandidates,
  });

  registerClipboardImageHandler({
    ipcMain,
    clipboard,
    nativeImage,
    getTrustedImageOrigins,
  });

  registerImageContextMenuHandler({
    ipcMain,
    Menu,
    BrowserWindow,
    clipboard,
    nativeImage,
    getTrustedImageOrigins,
  });
}

module.exports = {
  buildTrustedImageOrigins,
  registerImageInteractionHandlers,
};
