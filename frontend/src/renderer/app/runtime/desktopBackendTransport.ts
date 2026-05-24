import type { BackendTransport } from '../../infrastructure/api/windieSdkClient';
import { IpcBridge, SEND_CHANNELS } from '../../infrastructure/ipc/bridge';
import { getMemoryRetrievalInjectionEnabled } from '../../utils/memoryRetrievalPreference';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';

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

function sendStopQuery(conversationRef: string | null): void {
  IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
    type: 'stop-query',
    payload: {
      conversation_ref: conversationRef,
    },
  });
}

function sendQuery(payload: Record<string, unknown>, workspacePath: string | null): void {
  IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
    type: 'query',
    payload: {
      text: optionalString(payload.text) ?? '',
      conversation_ref: optionalString(payload.conversation_ref)
        ?? optionalString(payload.conversationRef)
        ?? '',
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
    },
  });
}

function optionalRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function sendRehydrateConversation(payload: Record<string, unknown>, workspacePath: string | null): void {
  IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
    type: 'rehydrate',
    payload: {
      conversation_ref: optionalString(payload.conversation_ref)
        ?? optionalString(payload.conversationRef)
        ?? '',
      messages: optionalRecordArray(payload.messages),
      rehydrate_mode: 'replace',
      workspace_path: optionalString(payload.workspace_path)
        ?? optionalString(payload.workspacePath)
        ?? workspacePath
        ?? null,
    },
  });
}

function sendCompactHistory(payload: Record<string, unknown>): void {
  IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
    type: 'compact-history',
    payload: {
      force: payload.force !== false,
      conversation_ref: optionalString(payload.conversation_ref)
        ?? optionalString(payload.conversationRef)
        ?? null,
    },
  });
}

function sendWakewordDetected(payload: Record<string, unknown>): void {
  IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
    type: 'wakeword-detected',
    payload,
  });
}

function sendUpdateSettings(payload: Record<string, unknown>): void {
  IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
    type: 'update-settings',
    payload,
  });
}

function sendListModels(): void {
  IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
    type: 'list-models',
  });
}

export function createDesktopBackendTransport(workspacePath: string | null = null): BackendTransport {
  const normalizedWorkspacePath = optionalString(workspacePath);
  return {
    connect: async () => undefined,
    handshake: async () => undefined,
    sendQuery: async (payload) => {
      sendQuery(payload, normalizedWorkspacePath);
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? '';
    },
    sendToolResult: async () => undefined,
    sendToolBundleResult: async () => undefined,
    rehydrateConversation: async (payload) => {
      sendRehydrateConversation(payload, normalizedWorkspacePath);
    },
    compactHistory: async (payload) => {
      sendCompactHistory(payload);
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? undefined;
    },
    wakewordDetected: async (payload) => {
      sendWakewordDetected(payload);
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? undefined;
    },
    updateSettings: async (payload) => {
      sendUpdateSettings(payload);
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? undefined;
    },
    listModels: async () => {
      sendListModels();
      return undefined;
    },
    stop: async (payload) => {
      sendStopQuery(
        optionalString(payload.conversation_ref) ?? optionalString(payload.conversationRef),
      );
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
}
