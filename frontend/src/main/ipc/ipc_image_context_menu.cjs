/**
 * Provides the ipc image context menu module for the Electron main process.
 */

const { createClipboardImageRuntime } = require('./ipc_clipboard_image.cjs');

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
  trustedImageOrigins = [],
  getTrustedImageOrigins,
  backendHttpUrl,
}) {
  const clipboardImageRuntime = createClipboardImageRuntime({
    clipboard,
    nativeImage,
    fetchImpl,
    trustedImageOrigins,
    getTrustedImageOrigins,
    backendHttpUrl,
  });
  const menu = buildImageContextMenu({
    src,
    Menu,
    onCopy: async (imageSrc) => clipboardImageRuntime.copy({
      src: imageSrc,
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

function createImageContextMenuRuntime({
  Menu,
  BrowserWindow,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
  trustedImageOrigins = [],
  getTrustedImageOrigins,
  backendHttpUrl,
} = {}) {
  function show(input = {}) {
    return showImageContextMenu({
      event: input.event,
      src: input.src,
      Menu,
      BrowserWindow,
      clipboard,
      nativeImage,
      fetchImpl,
      trustedImageOrigins,
      getTrustedImageOrigins,
      backendHttpUrl,
    });
  }

  return {
    show,
  };
}

module.exports = {
  createImageContextMenuRuntime,
};
