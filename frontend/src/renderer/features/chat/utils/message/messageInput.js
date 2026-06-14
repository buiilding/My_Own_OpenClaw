/**
 * Provides the message input module for the renderer UI.
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

function normalizeClipboardImages(clipboardImages) {
  if (!Array.isArray(clipboardImages)) {
    return [];
  }
  return clipboardImages.filter((image) => isClipboardImage(image));
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
  return readableFiles.filter((readableFile) => isReadableFileAttachment(readableFile));
}

export function buildOutgoingMessage(
  inputValue,
  isSending,
  clipboardImages = [],
  readableFiles = [],
) {
  if (isSending) {
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
