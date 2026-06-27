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

const ALLOWED_OUTGOING_PAYLOAD_FIELDS = new Set([
  'clipboardImages',
  'readableFiles',
  'text',
]);

function hasUnsupportedOutgoingPayloadField(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((field) => !ALLOWED_OUTGOING_PAYLOAD_FIELDS.has(field));
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

  if (hasUnsupportedOutgoingPayloadField(payload as Record<string, unknown>)) {
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
