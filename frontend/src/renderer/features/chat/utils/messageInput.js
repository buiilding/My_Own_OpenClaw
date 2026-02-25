function normalizeMessageForSend(inputValue) {
  const trimmed = inputValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasClipboardImage(clipboardImage) {
  return Boolean(
    clipboardImage
    && typeof clipboardImage === 'object'
    && typeof clipboardImage.base64 === 'string'
    && clipboardImage.base64.length > 0,
  );
}

export function buildOutgoingMessage(inputValue, isSending, clipboardImage = null) {
  if (isSending) {
    return null;
  }

  const normalizedText = normalizeMessageForSend(inputValue);
  if (!normalizedText) {
    return null;
  }

  if (!hasClipboardImage(clipboardImage)) {
    return normalizedText;
  }

  return {
    text: normalizedText,
    clipboardImage,
  };
}
