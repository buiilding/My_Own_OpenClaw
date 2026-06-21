/**
 * Provides the SDK desktop transport adapter for the renderer UI.
 */

import {
  SDK_RUNTIME_COMMANDS,
  type AgentRuntimeTransport,
} from './desktopConversationRuntimeContracts';
import { getMemoryRetrievalInjectionEnabled } from './desktopMemoryRetrievalPreferenceRuntime';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';
import { invokeAgentSdkCommand } from './agentSdkCommandInvokeClient';

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

function rejectRemovedCamelCaseFields(
  payload: Record<string, unknown>,
  fields: string[],
  owner: string,
): void {
  const present = fields.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
  if (present.length > 0) {
    throw new Error(
      `${owner} received removed camelCase field(s): ${present.join(', ')}. Use canonical snake_case fields.`,
    );
  }
}

async function sendStopQuery(conversationRef: string | null, turnRef: string | null): Promise<void> {
  await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_STOP, {
    conversation_ref: conversationRef,
    turn_ref: turnRef,
  });
}

async function sendQuery(
  payload: Record<string, unknown>,
  workspacePath: string | null,
  messageId: string | null,
): Promise<string | null> {
  rejectRemovedCamelCaseFields(payload, [
    'conversationRef',
    'screenshotRef',
    'screenshotUrl',
    'screenshotRefs',
    'attachmentContext',
    'attachmentFilenames',
    'workspacePath',
    'turnRef',
    'queryMessageId',
    'messageId',
  ], 'conversation.send');
  const removedSnakeCaseFields = ['message_id'].filter((field) => (
    Object.prototype.hasOwnProperty.call(payload, field)
  ));
  if (removedSnakeCaseFields.length > 0) {
    throw new Error(
      `conversation.send received removed field(s): ${removedSnakeCaseFields.join(', ')}. Use query_message_id.`,
    );
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'id')) {
    throw new Error('conversation.send received removed id field. Use query_message_id.');
  }
  const result = await invokeAgentSdkCommand<Record<string, unknown> | null>(
    SDK_RUNTIME_COMMANDS.CONVERSATION_SEND,
    {
      text: optionalString(payload.text) ?? '',
      conversation_ref: optionalString(payload.conversation_ref) ?? '',
      query_message_id: messageId,
      screenshot_ref: optionalString(payload.screenshot_ref) ?? null,
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
      : 'Failed to send query through agent runtime';
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
  rejectRemovedCamelCaseFields(payload, ['conversationRef', 'workspacePath'], 'conversation.rehydrate');
  await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE, {
    conversation_ref: optionalString(payload.conversation_ref) ?? '',
    messages: optionalRecordArray(payload.messages),
    rehydrate_mode: 'replace',
    workspace_path: optionalString(payload.workspace_path) ?? workspacePath ?? null,
  });
}

async function sendCompactHistory(payload: Record<string, unknown>): Promise<void> {
  rejectRemovedCamelCaseFields(payload, ['conversationRef', 'turnRef'], 'conversation.compact');
  await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT, {
    force: payload.force !== false,
    conversation_ref: optionalString(payload.conversation_ref) ?? null,
  });
}

async function sendWakewordDetected(payload: Record<string, unknown>): Promise<void> {
  rejectRemovedCamelCaseFields(payload, ['turnRef'], 'wakeword.detected');
  await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED, payload);
}

async function sendUpdateSettings(payload: Record<string, unknown>): Promise<void> {
  rejectRemovedCamelCaseFields(payload, ['turnRef'], 'settings.update');
  await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE, payload);
}

async function sendListModels(): Promise<void> {
  await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.MODELS_LIST);
}

export function createDesktopRuntimeTransport(workspacePath: string | null = null): AgentRuntimeTransport {
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
      rejectRemovedCamelCaseFields(payload, ['conversationRef', 'turnRef'], 'conversation.stop');
      await sendStopQuery(
        optionalString(payload.conversation_ref),
        optionalString(payload.turn_ref),
      );
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
}
