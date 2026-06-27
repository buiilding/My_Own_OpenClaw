/**
 * Provides renderer outgoing message payload normalization for send surfaces.
 */

function normalizeMessageForSend(inputValue) {
  const trimmed = inputValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function exactNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function isClipboardImage(clipboardImage) {
  return Boolean(clipboardImage && typeof clipboardImage === 'object' && exactNonEmptyString(clipboardImage.base64));
}

function normalizeClipboardImage(clipboardImage) {
  if (!isClipboardImage(clipboardImage)) {
    return null;
  }
  const base64 = exactNonEmptyString(clipboardImage.base64);
  const contentType = exactNonEmptyString(clipboardImage.contentType);
  const filename = exactNonEmptyString(clipboardImage.filename);
  const normalizedImage = {
    base64,
  };
  if (contentType) {
    normalizedImage.contentType = contentType;
  }
  if (filename) {
    normalizedImage.filename = filename;
  }
  return normalizedImage;
}

function normalizeClipboardImages(clipboardImages) {
  if (!Array.isArray(clipboardImages)) {
    return [];
  }
  return clipboardImages
    .map((image) => normalizeClipboardImage(image))
    .filter(Boolean);
}

function isReadableFileAttachment(readableFile) {
  return Boolean(
    readableFile
    && typeof readableFile === 'object'
    && exactNonEmptyString(readableFile.filePath)
    && exactNonEmptyString(readableFile.filename),
  );
}

function normalizeReadableFiles(readableFiles) {
  if (!Array.isArray(readableFiles)) {
    return [];
  }
  return readableFiles
    .filter((readableFile) => isReadableFileAttachment(readableFile))
    .map((readableFile) => ({
      filePath: exactNonEmptyString(readableFile.filePath),
      filename: exactNonEmptyString(readableFile.filename),
    }));
}

function buildOutgoingMessage(
  inputValue,
  isSubmitBlocked,
  clipboardImages = [],
  readableFiles = [],
) {
  if (isSubmitBlocked) {
    return null;
  }

  const normalizedText = normalizeMessageForSend(inputValue);
  const normalizedClipboardImages = normalizeClipboardImages(clipboardImages);
  const normalizedReadableFiles = normalizeReadableFiles(readableFiles);
  const hasAttachments = normalizedClipboardImages.length > 0 || normalizedReadableFiles.length > 0;

  if (!normalizedText && !hasAttachments) {
    return null;
  }

  if (!hasAttachments) {
    return normalizedText;
  }

  return {
    text: normalizedText || 'Please review the attached files.',
    clipboardImages: normalizedClipboardImages,
    readableFiles: normalizedReadableFiles,
  };
}

function focusTextInputAtEnd(input) {
  if (!input || typeof input.focus !== 'function') {
    return false;
  }

  input.focus();
  const textLength = typeof input.value === 'string' ? input.value.length : 0;
  input.setSelectionRange?.(textLength, textLength);
  return true;
}

export const DesktopMessageInputRuntime = Object.freeze({
  buildOutgoingMessage,
  focusTextInputAtEnd,
});
