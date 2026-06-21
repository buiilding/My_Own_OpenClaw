/**
 * Registers image-related IPC handlers for Electron main.
 */

const { createClipboardImageRuntime } = require('./ipc_clipboard_image.cjs');
const { createImageContextMenuRuntime } = require('./ipc_image_context_menu.cjs');

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
  fetchImpl = globalThis.fetch,
  getBackendHttpUrl,
  getBackendCandidates,
} = {}) {
  const getTrustedImageOrigins = () => buildTrustedImageOrigins({
    getBackendHttpUrl,
    getBackendCandidates,
  });

  const clipboardImageRuntime = createClipboardImageRuntime({
    clipboard,
    nativeImage,
    fetchImpl,
    getTrustedImageOrigins,
  });

  const imageContextMenuRuntime = createImageContextMenuRuntime({
    Menu,
    BrowserWindow,
    clipboard,
    nativeImage,
    fetchImpl,
    getTrustedImageOrigins,
  });

  ipcMain.handle('copy-image-to-clipboard', async (_event, payload = {}) => {
    try {
      return await clipboardImageRuntime.copy({
        src: payload?.src,
      });
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'Failed to copy image to clipboard.'),
      };
    }
  });

  ipcMain.handle('show-image-context-menu', async (event, payload = {}) => {
    try {
      return await imageContextMenuRuntime.show({
        event,
        src: payload?.src,
      });
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'Failed to show image context menu.'),
      };
    }
  });
}

function createImageInteractionHandlersRuntime({
  Menu,
  BrowserWindow,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
  getBackendHttpUrl,
  getBackendCandidates,
} = {}) {
  function register({ ipcMain } = {}) {
    return registerImageInteractionHandlers({
      ipcMain,
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      fetchImpl,
      getBackendHttpUrl,
      getBackendCandidates,
    });
  }

  return {
    register,
  };
}

module.exports = {
  createImageInteractionHandlersRuntime,
};
