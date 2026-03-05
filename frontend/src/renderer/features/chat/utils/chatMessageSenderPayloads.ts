import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';

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
  clipboardImage?: ClipboardImagePayload | null;
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

  const legacyClipboardImage = normalizeClipboardImage(payload.clipboardImage);
  if (legacyClipboardImage) {
    normalizedClipboardImages.push(legacyClipboardImage);
  }

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

export async function buildReadableFileAttachmentContext(
  readableFiles: ReadableFilePayload[],
): Promise<string | null> {
  if (!Array.isArray(readableFiles) || readableFiles.length === 0) {
    return null;
  }

  const attachmentSections: string[] = [];
  for (const readableFile of readableFiles) {
    try {
      const result = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
        toolName: 'read_file',
        args: { file_path: readableFile.filePath },
        skipAutoCapture: true,
      }) as {
        success?: boolean;
        data?: Record<string, unknown> | null;
        error?: string | null;
      };
      const resultData = (
        result?.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ) ? result.data : null;
      const llmContent = (
        typeof resultData?.llm_content === 'string' && resultData.llm_content.trim().length > 0
      )
        ? resultData.llm_content
        : (
          typeof resultData?.content === 'string' && resultData.content.trim().length > 0
            ? resultData.content
            : null
        );
      if (!result?.success || !llmContent) {
        if (typeof result?.error === 'string' && result.error.trim().length > 0) {
          console.warn(
            `[useChatMessageSender] read_file failed for attachment "${readableFile.filename}": ${result.error}`,
          );
        }
        continue;
      }
      attachmentSections.push(
        `--- Attached File: ${readableFile.filename} ---\n${llmContent}`,
      );
    } catch (error) {
      console.warn(
        `[useChatMessageSender] Failed to read selected attachment "${readableFile.filename}":`,
        error,
      );
    }
  }

  if (attachmentSections.length === 0) {
    return null;
  }
  return attachmentSections.join('\n\n');
}
