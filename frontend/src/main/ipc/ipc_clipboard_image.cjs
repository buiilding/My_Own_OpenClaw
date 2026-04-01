async function copyImageToClipboard({
  src,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof src !== 'string' || src.trim().length === 0) {
    throw new Error('Image source is required.');
  }

  if (!clipboard || typeof clipboard.writeImage !== 'function') {
    throw new Error('Clipboard image support is unavailable.');
  }

  if (!nativeImage) {
    throw new Error('Native image support is unavailable.');
  }

  const normalizedSrc = src.trim();
  let image = null;

  if (normalizedSrc.startsWith('data:image/')) {
    if (typeof nativeImage.createFromDataURL !== 'function') {
      throw new Error('Clipboard data URL decoding is unavailable.');
    }
    image = nativeImage.createFromDataURL(normalizedSrc);
  } else {
    if (typeof fetchImpl !== 'function') {
      throw new Error('Image fetch support is unavailable.');
    }
    if (typeof nativeImage.createFromBuffer !== 'function') {
      throw new Error('Clipboard buffer decoding is unavailable.');
    }

    const response = await fetchImpl(normalizedSrc);
    if (!response || response.ok !== true) {
      throw new Error(`Failed to fetch image for clipboard copy (${response?.status || 'unknown'}).`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    image = nativeImage.createFromBuffer(imageBuffer);
  }

  if (!image || (typeof image.isEmpty === 'function' && image.isEmpty())) {
    throw new Error('Failed to decode image for clipboard copy.');
  }

  clipboard.writeImage(image);
  return { success: true };
}

function registerClipboardImageHandler({
  ipcMain,
  clipboard,
  nativeImage,
  fetchImpl = globalThis.fetch,
}) {
  ipcMain.handle('copy-image-to-clipboard', async (_event, payload = {}) => {
    try {
      return await copyImageToClipboard({
        src: payload?.src,
        clipboard,
        nativeImage,
        fetchImpl,
      });
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'Failed to copy image to clipboard.'),
      };
    }
  });
}

module.exports = {
  copyImageToClipboard,
  registerClipboardImageHandler,
};
