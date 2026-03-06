import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import type { ReadableFilePayload } from './chatMessageSenderPayloads';

type ReadFileToolResult = {
  success?: boolean;
  data?: Record<string, unknown> | null;
  error?: string | null;
};

function resolveReadableAttachmentText(result: ReadFileToolResult): string | null {
  const resultData = (
    result?.data
    && typeof result.data === 'object'
    && !Array.isArray(result.data)
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
  return llmContent;
}

async function readAttachmentSection(readableFile: ReadableFilePayload): Promise<string | null> {
  try {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'read_file',
      args: { file_path: readableFile.filePath },
      skipAutoCapture: true,
    }) as ReadFileToolResult;
    const llmContent = resolveReadableAttachmentText(result);
    if (!result?.success || !llmContent) {
      if (typeof result?.error === 'string' && result.error.trim().length > 0) {
        console.warn(
          `[useChatMessageSender] read_file failed for attachment "${readableFile.filename}": ${result.error}`,
        );
      }
      return null;
    }
    return `--- Attached File: ${readableFile.filename} ---\n${llmContent}`;
  } catch (error) {
    console.warn(
      `[useChatMessageSender] Failed to read selected attachment "${readableFile.filename}":`,
      error,
    );
    return null;
  }
}

export async function buildReadableFileAttachmentContext(
  readableFiles: ReadableFilePayload[],
): Promise<string | null> {
  if (!Array.isArray(readableFiles) || readableFiles.length === 0) {
    return null;
  }

  const sections = await Promise.all(readableFiles.map((readableFile) => readAttachmentSection(readableFile)));
  const validSections = sections.filter((section): section is string => Boolean(section));
  if (validSections.length === 0) {
    return null;
  }
  return validSections.join('\n\n');
}
