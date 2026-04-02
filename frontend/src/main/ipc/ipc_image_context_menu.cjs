const { copyImageToClipboard } = require('./ipc_clipboard_image.cjs');

function buildImageContextMenu({
  src,
  Menu,
  onCopy,
}) {
  if (typeof src !== 'string' || src.trim().length === 0) {
    throw new Error('Image source is required.');
  }

  if (!Menu || typeof Menu.buildFromTemplate !== 'function') {
    throw new Error('Native menu support is unavailable.');
  }

  return Menu.buildFromTemplate([
    {
      label: 'Copy image',
      click: async () => {
        await onCopy(src.trim());
      },
    },
  ]);
}

async function showImageContextMenu({
  event,
  src,
  Menu,
  BrowserWindow,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
}) {
  const menu = buildImageContextMenu({
    src,
    Menu,
    onCopy: async (imageSrc) => copyImageToClipboard({
      src: imageSrc,
      clipboard,
      nativeImage,
      fetchImpl,
    }),
  });

  const targetWindow = typeof BrowserWindow?.fromWebContents === 'function'
    ? BrowserWindow.fromWebContents(event?.sender || null)
    : null;

  menu.popup({
    window: targetWindow || undefined,
  });

  return { success: true };
}

function registerImageContextMenuHandler({
  ipcMain,
  Menu,
  BrowserWindow,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
}) {
  ipcMain.handle('show-image-context-menu', async (event, payload = {}) => {
    try {
      return await showImageContextMenu({
        event,
        src: payload?.src,
        Menu,
        BrowserWindow,
        clipboard,
        nativeImage,
        fetchImpl,
      });
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'Failed to show image context menu.'),
      };
    }
  });
}

module.exports = {
  buildImageContextMenu,
  showImageContextMenu,
  registerImageContextMenuHandler,
};
