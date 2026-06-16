/**
 * Provides the desktop backend transport module for the renderer UI.
 */

import {
  SDK_RUNTIME_COMMANDS,
  type BackendTransport,
} from '../../infrastructure/api/windieSdkClient';
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

async function sendStopQuery(conversationRef: string | null, turnRef: string | null): Promise<void> {
  await invokeWindieCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_STOP, {
    conversation_ref: conversationRef,
    turn_ref: turnRef,
  });
}

async function sendQuery(
  payload: Record<string, unknown>,
  workspacePath: string | null,
  messageId: string | null,
): Promise<string | null> {
  const result = await invokeWindieCommand<Record<string, unknown> | null>(
    SDK_RUNTIME_COMMANDS.CONVERSATION_SEND,
    {
      text: optionalString(payload.text) ?? '',
      conversation_ref: optionalString(payload.conversation_ref) ?? '',
      query_message_id: messageId,
      screenshot_ref: optionalString(payload.screenshot_ref) ?? null,
      screenshot: optionalString(payload.screenshot) ?? null,
      screenshot_url: optionalString(payload.screenshot_url) ?? null,
      screenshot_refs: optionalStringArray(payload.screenshot_refs) ?? null,
      capture_meta: payload.capture_meta ?? null,
      attachment_context: optionalString(payload.attachment_context) ?? null,
      attachment_filenames: optionalStringArray(payload.attachment_filenames) ?? null,
      workspace_path: optionalString(payload.workspace_path) ?? workspacePath ?? null,
      memory_retrieval_enabled: getMemoryRetrievalInjectionEnabled(),
    },
  );
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
  await invokeWindieCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE, {
    conversation_ref: optionalString(payload.conversation_ref) ?? '',
    messages: optionalRecordArray(payload.messages),
    rehydrate_mode: 'replace',
    workspace_path: optionalString(payload.workspace_path) ?? workspacePath ?? null,
  });
}

async function sendCompactHistory(payload: Record<string, unknown>): Promise<void> {
  await invokeWindieCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT, {
    force: payload.force !== false,
    conversation_ref: optionalString(payload.conversation_ref) ?? null,
  });
}

async function sendWakewordDetected(payload: Record<string, unknown>): Promise<void> {
  await invokeWindieCommand(SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED, payload);
}

async function sendUpdateSettings(payload: Record<string, unknown>): Promise<void> {
  await invokeWindieCommand(SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE, payload);
}

async function sendListModels(): Promise<void> {
  await invokeWindieCommand(SDK_RUNTIME_COMMANDS.MODELS_LIST);
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
      return optionalString(payload.turn_ref) ?? undefined;
    },
    wakewordDetected: async (payload) => {
      await sendWakewordDetected(payload);
      return optionalString(payload.turn_ref) ?? undefined;
    },
    updateSettings: async (payload) => {
      await sendUpdateSettings(payload);
      return optionalString(payload.turn_ref) ?? undefined;
    },
    listModels: async () => {
      await sendListModels();
      return undefined;
    },
    stop: async (payload) => {
      await sendStopQuery(
        optionalString(payload.conversation_ref),
        optionalString(payload.turn_ref),
      );
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
}
