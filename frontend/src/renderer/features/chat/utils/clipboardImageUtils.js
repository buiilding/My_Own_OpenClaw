import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../../infrastructure/services/ArtifactImageUtils';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to load pasted image data.'));
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read pasted image.'));
    };
    reader.readAsDataURL(file);
  });
}

function parseDataUrlImage(dataUrl, fallbackContentType = null) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  const contentType = normalizeArtifactImageContentType(match[1] || fallbackContentType);
  const extension = resolveArtifactImageExtension(contentType);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    base64: match[2],
    contentType,
    filename: `clipboard-image.${extension}`,
    previewUrl: dataUrl,
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
      const dataUrl = await readFileAsDataUrl(imageFile);
      return parseDataUrlImage(dataUrl, imageItem.type || imageFile.type || null);
    }),
  )).filter(Boolean);
  return parsedImages;
}
