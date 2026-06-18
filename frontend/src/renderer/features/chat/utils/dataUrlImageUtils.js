/**
 * Provides the data url image utils module for the renderer UI.
 */

import { DesktopArtifactRuntimeClient } from '../../../app/runtime/desktopArtifactRuntimeClient';

export function readFileAsDataUrl(
  file,
  {
    loadErrorMessage = 'Failed to load image data.',
    readErrorMessage = 'Failed to read image file.',
  } = {},
) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error(loadErrorMessage));
    };
    reader.onerror = () => {
      reject(reader.error || new Error(readErrorMessage));
    };
    reader.readAsDataURL(file);
  });
}

export function parseBase64ImageDataUrl(dataUrl, fallbackContentType = null) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  const contentType = DesktopArtifactRuntimeClient.normalizeArtifactImageContentType(
    match[1] || fallbackContentType,
  );
  return {
    base64: match[2],
    contentType,
    extension: DesktopArtifactRuntimeClient.resolveArtifactImageExtension(contentType),
    previewUrl: dataUrl,
  };
}
