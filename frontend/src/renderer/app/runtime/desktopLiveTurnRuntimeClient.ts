import {
  type WindieModelSelection,
} from '../../infrastructure/api/windieSdkClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import type { CaptureMeta } from '../../infrastructure/services/ScreenshotAttachmentPipeline';
import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';
import { getMemoryRetrievalInjectionEnabled } from '../../utils/memoryRetrievalPreference';

type SendConversationQueryInput = {
  text: string;
  conversationRef: string;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotRefs?: string[] | null;
  captureMeta?: CaptureMeta | null;
  attachmentContext?: string | null;
  attachmentFilenames?: string[] | null;
  screenshot?: string | null;
  workspacePath?: string | null;
  model?: WindieModelSelection | null;
  turnRef?: string | null;
};

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
  return normalized.length > 0 ? normalized : null;
}

function throwIfFailedIpcResult(result: unknown): void {
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== false) {
    return;
  }
  const message = 'error' in result && typeof result.error === 'string' && result.error.trim()
    ? result.error.trim()
    : 'Failed to send command to WindieOS runtime';
  throw new Error(message);
}

/**
 * Renderer live-turn facade for SDK-backed query and stop commands.
 *
 * Continuity, transcript, replay, compaction, and settings behavior belongs in
 * focused runtime services instead of this live-turn command surface.
 */
export const DesktopLiveTurnRuntimeClient = {
  async sendQuery(input: SendConversationQueryInput): Promise<void> {
    const turnRef = optionalString(input.turnRef) ?? undefined;
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.WINDIE_SEND, {
      text: input.text,
      conversation_ref: optionalString(input.conversationRef) ?? '',
      query_message_id: turnRef ?? null,
      ...(input.model ? { model: input.model } : {}),
      id: turnRef ?? null,
      messageId: turnRef ?? null,
      message_id: turnRef ?? null,
      screenshot_ref: optionalString(input.screenshotRef) ?? null,
      screenshot_url: optionalString(input.screenshotUrl) ?? null,
      screenshot_refs: optionalStringArray(input.screenshotRefs) ?? null,
      capture_meta: input.captureMeta ?? null,
      attachment_context: optionalString(input.attachmentContext) ?? null,
      attachment_filenames: optionalStringArray(input.attachmentFilenames) ?? null,
      screenshot: optionalString(input.screenshot) ?? null,
      workspace_path: optionalString(input.workspacePath) ?? null,
      memory_retrieval_enabled: getMemoryRetrievalInjectionEnabled(),
    });
    throwIfFailedIpcResult(result);
  },

  async stop(conversationRef: string | null = null): Promise<void> {
    const resolvedConversationRef = optionalString(conversationRef)
      ?? DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
    if (!resolvedConversationRef) {
      return;
    }
    await IpcBridge.invoke(INVOKE_CHANNELS.WINDIE_STOP, {
      conversation_ref: resolvedConversationRef,
      turn_ref: null,
    });
  },
};
