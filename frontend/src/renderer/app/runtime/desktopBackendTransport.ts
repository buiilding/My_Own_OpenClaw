import type { BackendTransport } from '../../infrastructure/api/windieSdkClient';
import { getMemoryRetrievalInjectionEnabled } from '../../utils/memoryRetrievalPreference';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';
import { invokeWindieCommand } from './windieCommandInvokeClient';

function optionalString(value: unknown): string | null {
  return normalizeNonEmptyString(value);
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

async function sendStopQuery(conversationRef: string | null): Promise<void> {
  await invokeWindieCommand('conversation.stop', {
    conversation_ref: conversationRef,
  });
}

async function sendQuery(
  payload: Record<string, unknown>,
  workspacePath: string | null,
  messageId: string | null,
): Promise<string | null> {
  const result = await invokeWindieCommand<Record<string, unknown> | null>('conversation.send', {
    text: optionalString(payload.text) ?? '',
    conversation_ref: optionalString(payload.conversation_ref)
      ?? optionalString(payload.conversationRef)
      ?? '',
    query_message_id: messageId,
    screenshot_ref: optionalString(payload.screenshot_ref)
      ?? optionalString(payload.screenshotRef)
      ?? null,
    screenshot: optionalString(payload.screenshot) ?? null,
    screenshot_url: optionalString(payload.screenshot_url)
      ?? optionalString(payload.screenshotUrl)
      ?? null,
    screenshot_refs: optionalStringArray(payload.screenshot_refs)
      ?? optionalStringArray(payload.screenshotRefs)
      ?? null,
    capture_meta: payload.capture_meta ?? payload.captureMeta ?? null,
    attachment_context: optionalString(payload.attachment_context)
      ?? optionalString(payload.attachmentContext)
      ?? null,
    attachment_filenames: optionalStringArray(payload.attachment_filenames)
      ?? optionalStringArray(payload.attachmentFilenames)
      ?? null,
    workspace_path: optionalString(payload.workspace_path)
      ?? optionalString(payload.workspacePath)
      ?? workspacePath
      ?? null,
    memory_retrieval_enabled: getMemoryRetrievalInjectionEnabled(),
  });
  if (result && typeof result === 'object' && result.ok === false) {
    const message = typeof result.error === 'string' && result.error.trim().length > 0
      ? result.error
      : 'Failed to send query to backend';
    throw new Error(message);
  }
  if (
    result
    && typeof result === 'object'
    && 'messageId' in result
    && typeof result.messageId === 'string'
    && result.messageId.trim().length > 0
  ) {
    return result.messageId.trim();
  }
  return messageId;
}

function optionalRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

async function sendRehydrateConversation(payload: Record<string, unknown>, workspacePath: string | null): Promise<void> {
  await invokeWindieCommand('conversation.rehydrate', {
    conversation_ref: optionalString(payload.conversation_ref)
      ?? optionalString(payload.conversationRef)
      ?? '',
    messages: optionalRecordArray(payload.messages),
    rehydrate_mode: 'replace',
    workspace_path: optionalString(payload.workspace_path)
      ?? optionalString(payload.workspacePath)
      ?? workspacePath
      ?? null,
  });
}

async function sendCompactHistory(payload: Record<string, unknown>): Promise<void> {
  await invokeWindieCommand('conversation.compact', {
    force: payload.force !== false,
    conversation_ref: optionalString(payload.conversation_ref)
      ?? optionalString(payload.conversationRef)
      ?? null,
  });
}

async function sendWakewordDetected(payload: Record<string, unknown>): Promise<void> {
  await invokeWindieCommand('wakeword.detected', payload);
}

async function sendUpdateSettings(payload: Record<string, unknown>): Promise<void> {
  await invokeWindieCommand('settings.update', payload);
}

async function sendListModels(): Promise<void> {
  await invokeWindieCommand('models.list');
}

export function createDesktopBackendTransport(workspacePath: string | null = null): BackendTransport {
  const normalizedWorkspacePath = optionalString(workspacePath);
  return {
    connect: async () => undefined,
    handshake: async () => undefined,
    sendQuery: async (payload, options = {}) => {
      const messageId = optionalString(options.messageId);
      return await sendQuery(payload, normalizedWorkspacePath, messageId) ?? '';
    },
    sendToolResult: async () => undefined,
    sendToolBundleResult: async () => undefined,
    rehydrateConversation: async (payload) => {
      await sendRehydrateConversation(payload, normalizedWorkspacePath);
    },
    compactHistory: async (payload) => {
      await sendCompactHistory(payload);
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? undefined;
    },
    wakewordDetected: async (payload) => {
      await sendWakewordDetected(payload);
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? undefined;
    },
    updateSettings: async (payload) => {
      await sendUpdateSettings(payload);
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? undefined;
    },
    listModels: async () => {
      await sendListModels();
      return undefined;
    },
    stop: async (payload) => {
      await sendStopQuery(
        optionalString(payload.conversation_ref),
      );
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
}
