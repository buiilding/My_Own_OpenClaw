/**
 * Normalizes renderer chat send payloads into SDK turn resource handles.
 */

export type ClipboardImagePayload = {
  base64: string;
  contentType?: string | null;
  filename?: string | null;
};

export type ReadableFilePayload = {
  filePath: string;
  filename: string;
};

export type OutgoingUserMessagePayload = string | {
  text: string;
  clipboardImages?: ClipboardImagePayload[] | null;
  readableFiles?: ReadableFilePayload[] | null;
};

const REMOVED_RENDERER_ATTACHMENT_PAYLOAD_FIELDS = Object.freeze([
  'attachmentContext',
  'attachmentFilenames',
  'attachments',
  'captureMeta',
  'displayAttachments',
  'screenshot',
  'screenshotRef',
  'screenshotRefs',
  'screenshotUrl',
]);

function hasRemovedRendererAttachmentPayloadField(payload: Record<string, unknown>): boolean {
  return REMOVED_RENDERER_ATTACHMENT_PAYLOAD_FIELDS.some((field) => (
    Object.prototype.hasOwnProperty.call(payload, field)
  ));
}

function normalizeOutgoingPayload(payload: OutgoingUserMessagePayload): {
  text: string;
  clipboardImages: ClipboardImagePayload[];
  readableFiles: ReadableFilePayload[];
} | null {
  const normalizeClipboardImage = (
    clipboardImage: ClipboardImagePayload | null | undefined,
  ): ClipboardImagePayload | null => {
    const hasClipboardImage = Boolean(
      clipboardImage
      && typeof clipboardImage.base64 === 'string'
      && clipboardImage.base64.length > 0,
    );
    return hasClipboardImage ? clipboardImage : null;
  };

  if (typeof payload === 'string') {
    return { text: payload, clipboardImages: [], readableFiles: [] };
  }

  if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string') {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'clipboardImage')) {
    return null;
  }
  if (hasRemovedRendererAttachmentPayloadField(payload as Record<string, unknown>)) {
    return null;
  }

  const normalizedClipboardImages = Array.isArray(payload.clipboardImages)
    ? payload.clipboardImages
      .map((clipboardImage) => normalizeClipboardImage(clipboardImage))
      .filter((clipboardImage): clipboardImage is ClipboardImagePayload => Boolean(clipboardImage))
    : [];

  const normalizedReadableFiles = Array.isArray(payload.readableFiles)
    ? payload.readableFiles
      .filter((readableFile): readableFile is ReadableFilePayload => Boolean(
        readableFile
        && typeof readableFile.filePath === 'string'
        && readableFile.filePath.length > 0
        && typeof readableFile.filename === 'string'
        && readableFile.filename.length > 0,
      ))
    : [];

  return {
    text: payload.text,
    clipboardImages: normalizedClipboardImages,
    readableFiles: normalizedReadableFiles,
  };
}

export const DesktopChatSendPayloadRuntime = Object.freeze({
  normalizeOutgoingPayload,
});
