/**
 * Provides the clipboard image utils module for the renderer UI.
 */

import {
  parseBase64ImageDataUrl,
  readFileAsDataUrl,
} from './dataUrlImageUtils';

function parseDataUrlImage(
  dataUrl,
  fallbackContentType = null,
) {
  const parsedImage = parseBase64ImageDataUrl(dataUrl, fallbackContentType);
  if (!parsedImage) {
    return null;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    base64: parsedImage.base64,
    contentType: parsedImage.contentType,
    filename: `clipboard-image.${parsedImage.extension}`,
    previewUrl: parsedImage.previewUrl,
  };
}

export async function parseClipboardImageItems(clipboardItems = []) {
  const imageItems = Array.from(clipboardItems).filter((item) => item?.type?.startsWith('image/'));
  if (imageItems.length === 0) {
    return [];
  }
  const parsedImages = (await Promise.all(
    imageItems.map(async (imageItem) => {
      const imageFile = imageItem.getAsFile();
      if (!imageFile) {
        return null;
      }
      const dataUrl = await readFileAsDataUrl(imageFile, {
        loadErrorMessage: 'Failed to load pasted image data.',
        readErrorMessage: 'Failed to read pasted image.',
      });
      return parseDataUrlImage(dataUrl, imageItem.type || imageFile.type || null);
    }),
  )).filter(Boolean);
  return parsedImages;
}
