/**
 * Provides renderer outgoing message payload normalization for send surfaces.
 */

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

function normalizeClipboardImage(clipboardImage) {
  if (!isClipboardImage(clipboardImage)) {
    return null;
  }
  const normalizedImage = {
    base64: clipboardImage.base64,
  };
  if (typeof clipboardImage.contentType === 'string') {
    normalizedImage.contentType = clipboardImage.contentType;
  }
  if (typeof clipboardImage.filename === 'string') {
    normalizedImage.filename = clipboardImage.filename;
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
    && typeof readableFile.filePath === 'string'
    && readableFile.filePath.length > 0
    && typeof readableFile.filename === 'string'
    && readableFile.filename.length > 0,
  );
}

function normalizeReadableFiles(readableFiles) {
  if (!Array.isArray(readableFiles)) {
    return [];
  }
  return readableFiles
    .filter((readableFile) => isReadableFileAttachment(readableFile))
    .map((readableFile) => ({
      filePath: readableFile.filePath,
      filename: readableFile.filename,
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
