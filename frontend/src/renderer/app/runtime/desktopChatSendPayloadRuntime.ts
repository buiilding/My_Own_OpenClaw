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

function exactNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function normalizeOutgoingPayload(payload: OutgoingUserMessagePayload): {
  text: string;
  clipboardImages: ClipboardImagePayload[];
  readableFiles: ReadableFilePayload[];
} | null {
  const normalizeClipboardImage = (
    clipboardImage: ClipboardImagePayload | null | undefined,
  ): ClipboardImagePayload | null => {
    const base64 = exactNonEmptyString(clipboardImage?.base64);
    if (!base64) {
      return null;
    }
    const contentType = exactNonEmptyString(clipboardImage?.contentType);
    const filename = exactNonEmptyString(clipboardImage?.filename);
    return {
      base64,
      ...(contentType ? { contentType } : {}),
      ...(filename ? { filename } : {}),
    };
  };

  const normalizeReadableFile = (
    readableFile: ReadableFilePayload | null | undefined,
  ): ReadableFilePayload | null => {
    const filePath = exactNonEmptyString(readableFile?.filePath);
    const filename = exactNonEmptyString(readableFile?.filename);
    return filePath && filename
      ? { filePath, filename }
      : null;
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
      .map((readableFile) => normalizeReadableFile(readableFile))
      .filter((readableFile): readableFile is ReadableFilePayload => Boolean(readableFile))
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
