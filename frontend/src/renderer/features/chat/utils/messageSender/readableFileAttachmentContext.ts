import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import type { ReadableFilePayload } from './chatMessageSenderPayloads';

type ReadFileToolResult = {
  success?: boolean;
  data?: Record<string, unknown> | null;
  error?: string | null;
};

export type ReadableFileAttachmentFailure = {
  filename: string;
  filePath: string;
  error: string;
};

export type ReadableFileAttachmentContextResult = {
  context: string | null;
  failures: ReadableFileAttachmentFailure[];
};

type ReadableFileAttachmentSectionResult = {
  section: string | null;
  failure: ReadableFileAttachmentFailure | null;
};

function resolveReadableAttachmentText(result: ReadFileToolResult): string | null {
  const resultData = (
    result?.data
    && typeof result.data === 'object'
    && !Array.isArray(result.data)
  ) ? result.data : null;
  const output = (
    typeof resultData?.output === 'string' && resultData.output.trim().length > 0
  )
    ? resultData.output
    : (
      typeof resultData?.content === 'string' && resultData.content.trim().length > 0
        ? resultData.content
        : null
    );
  return output;
}

function buildAttachmentFailure(
  readableFile: ReadableFilePayload,
  error: unknown,
): ReadableFileAttachmentFailure {
  const message = error instanceof Error
    ? error.message
    : String(error || 'No readable content returned.');
  return {
    filename: readableFile.filename,
    filePath: readableFile.filePath,
    error: message,
  };
}

async function readAttachmentSection(
  readableFile: ReadableFilePayload,
): Promise<ReadableFileAttachmentSectionResult> {
  try {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.READ_ATTACHMENT_FILE, {
      filePath: readableFile.filePath,
    }) as ReadFileToolResult;
    const output = resolveReadableAttachmentText(result);
    if (!result?.success || !output) {
      const errorMessage = (
        typeof result?.error === 'string' && result.error.trim().length > 0
      )
        ? result.error
        : 'No readable content returned.';
      if (typeof result?.error === 'string' && result.error.trim().length > 0) {
        console.warn(
          `[useChatMessageSender] read_file failed for attachment "${readableFile.filename}": ${result.error}`,
        );
      }
      return {
        section: null,
        failure: buildAttachmentFailure(readableFile, errorMessage),
      };
    }
    return {
      section: `--- Attached File: ${readableFile.filename} ---\n${output}`,
      failure: null,
    };
  } catch (error) {
    console.warn(
      `[useChatMessageSender] Failed to read selected attachment "${readableFile.filename}":`,
      error,
    );
    return {
      section: null,
      failure: buildAttachmentFailure(readableFile, error),
    };
  }
}

export async function buildReadableFileAttachmentContext(
  readableFiles: ReadableFilePayload[],
): Promise<ReadableFileAttachmentContextResult> {
  if (!Array.isArray(readableFiles) || readableFiles.length === 0) {
    return {
      context: null,
      failures: [],
    };
  }

  const results = await Promise.all(readableFiles.map((readableFile) => readAttachmentSection(readableFile)));
  const validSections = results
    .map((result) => result.section)
    .filter((section): section is string => Boolean(section));
  const failures = results
    .map((result) => result.failure)
    .filter((failure): failure is ReadableFileAttachmentFailure => Boolean(failure));
  return {
    context: validSections.length > 0 ? validSections.join('\n\n') : null,
    failures,
  };
}
