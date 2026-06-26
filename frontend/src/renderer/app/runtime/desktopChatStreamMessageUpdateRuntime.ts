/**
 * Normalizes renderer chat-stream message update payloads.
 */

import type { ToolSchema } from '../../types/toolSchemas';
import { DesktopChatMessageRuntimeClient } from './desktopChatMessageRuntimeClient';
import type {
  ChatMessage,
} from './desktopChatMessageTypes';

const {
  normalizeIncomingText,
  normalizeToolSchemaList,
} = DesktopChatMessageRuntimeClient;

type SystemPromptPayload = {
  content?: unknown;
  tool_schemas?: unknown;
};

type UserMessageFullPayload = {
  content?: unknown;
  metadata?: unknown;
};

type AssistantMessageFullPayload = {
  content?: unknown;
};

type ConversationStreamEventIdentity = {
  turnRefForUpdate?: string | null;
};

function normalizeToolSchemas(value: unknown): ToolSchema[] | undefined {
  return normalizeToolSchemaList(value);
}

function buildToolSchemasUpdate(payload: { tool_schemas?: unknown } | null | undefined) {
  return {
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

function buildSystemPromptUpdate(payload: SystemPromptPayload | null | undefined) {
  return {
    content: normalizeIncomingText(payload?.content),
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

function buildUserMessageFullUpdate(payload: UserMessageFullPayload | null | undefined) {
  const metadata = payload?.metadata;
  return {
    content: normalizeIncomingText(payload?.content),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : undefined,
  };
}

function buildAssistantMessageFullUpdate(payload: AssistantMessageFullPayload | null | undefined) {
  return {
    content: normalizeIncomingText(payload?.content),
  };
}

function buildLastBySenderStreamTarget(
  sender: ChatMessage['sender'],
  eventIdentity: ConversationStreamEventIdentity | null | undefined,
) {
  return {
    kind: 'last_by_sender' as const,
    sender,
    turnRef: eventIdentity?.turnRefForUpdate ?? undefined,
  };
}

function buildLastAssistantLlmTextStreamTarget(
  eventIdentity: ConversationStreamEventIdentity | null | undefined,
) {
  return {
    kind: 'last_assistant_llm_text' as const,
    turnRef: eventIdentity?.turnRefForUpdate ?? undefined,
  };
}

export const DesktopChatStreamMessageUpdateRuntime = Object.freeze({
  buildToolSchemasUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  buildAssistantMessageFullUpdate,
  buildLastBySenderStreamTarget,
  buildLastAssistantLlmTextStreamTarget,
});
