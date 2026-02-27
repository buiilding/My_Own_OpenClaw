function normalizeMessageForSend(inputValue) {
  const trimmed = inputValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isClipboardImage(clipboardImage) {
  return Boolean(
    clipboardImage
    && typeof clipboardImage === 'object'
    && typeof clipboardImage.base64 === 'string'
    && clipboardImage.base64.length > 0,
  );
}

function normalizeClipboardImages(clipboardImages) {
  if (!Array.isArray(clipboardImages)) {
    return [];
  }
  return clipboardImages.filter((image) => isClipboardImage(image));
}

export function buildOutgoingMessage(inputValue, isSending, clipboardImages = []) {
  if (isSending) {
    return null;
  }

  const normalizedText = normalizeMessageForSend(inputValue);
  if (!normalizedText) {
    return null;
  }

  const normalizedClipboardImages = normalizeClipboardImages(clipboardImages);
  if (normalizedClipboardImages.length === 0) {
    return normalizedText;
  }

  return {
    text: normalizedText,
    clipboardImages: normalizedClipboardImages,
  };
}
