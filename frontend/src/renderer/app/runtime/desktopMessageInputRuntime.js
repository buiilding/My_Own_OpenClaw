/**
 * Provides renderer outgoing message payload normalization for send surfaces.
 */

import { DesktopChatSendPayloadRuntime } from './desktopChatSendPayloadRuntime';

const {
  normalizeOutgoingPayload,
} = DesktopChatSendPayloadRuntime;

function normalizeMessageForSend(inputValue) {
  const trimmed = inputValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasComposerResources(clipboardImages, readableFiles) {
  return (
    Array.isArray(clipboardImages)
    && clipboardImages.length > 0
  ) || (
    Array.isArray(readableFiles)
    && readableFiles.length > 0
  );
}

function hasNormalizedResources(payload) {
  return payload.clipboardImages.length > 0 || payload.readableFiles.length > 0;
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
  const hasResources = hasComposerResources(clipboardImages, readableFiles);

  if (!normalizedText && !hasResources) {
    return null;
  }

  if (!hasResources) {
    return normalizedText;
  }

  const outgoingPayload = normalizeOutgoingPayload({
    text: normalizedText || 'Please review the attached files.',
    clipboardImages,
    readableFiles,
  });

  if (!outgoingPayload || !hasNormalizedResources(outgoingPayload)) {
    return normalizedText;
  }

  return outgoingPayload;
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
