/**
 * Provides the chat message sender payloads module for the renderer UI.
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

export function normalizeOutgoingPayload(payload: OutgoingUserMessagePayload): {
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

export function normalizeAttachmentFilenames(
  clipboardImages: ClipboardImagePayload[],
  readableFiles: ReadableFilePayload[],
): string[] {
  const candidateNames = [
    ...clipboardImages.map((clipboardImage) => (
      typeof clipboardImage.filename === 'string' ? clipboardImage.filename.trim() : ''
    )),
    ...readableFiles.map((readableFile) => (
      typeof readableFile.filename === 'string' ? readableFile.filename.trim() : ''
    )),
  ];
  const deduped = new Set<string>();
  for (const candidateName of candidateNames) {
    if (!candidateName) {
      continue;
    }
    deduped.add(candidateName);
  }
  return Array.from(deduped);
}
