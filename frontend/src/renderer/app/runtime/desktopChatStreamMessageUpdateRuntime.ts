/**
 * Normalizes renderer chat-stream message update payloads.
 */

import type { ToolSchema } from '../../types/toolSchemas';
import { DesktopChatMessageRuntimeClient } from './desktopChatMessageRuntimeClient';

const {
  normalizeIncomingText,
  normalizeToolSchemaList,
} = DesktopChatMessageRuntimeClient;

type ChatStreamMessageTarget = {
  id: string;
  sender?: string | null;
  type?: string | null;
  turnRef?: string | null;
};

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

function normalizeToolSchemas(value: unknown): ToolSchema[] | undefined {
  return normalizeToolSchemaList(value);
}

function buildToolSchemasUpdate(payload: { tool_schemas?: unknown } | null | undefined) {
  return {
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

function findLastMessage(
  messages: ChatStreamMessageTarget[],
  predicate: (message: ChatStreamMessageTarget) => boolean,
): ChatStreamMessageTarget | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (predicate(message)) {
      return message;
    }
  }
  return null;
}

function findLastMessageIdBySender(
  messages: ChatStreamMessageTarget[],
  sender: string,
  turnRef?: string,
): string | null {
  const lastMessage = findLastMessage(
    messages,
    (message) => (
      message.sender === sender
      && (!turnRef || message.turnRef === turnRef)
    ),
  );
  return lastMessage ? lastMessage.id : null;
}

function findLastAssistantLlmTextMessageId(
  messages: ChatStreamMessageTarget[],
  turnRef?: string,
): string | null {
  const lastMessage = findLastMessage(
    messages,
    (message) => (
      message.sender === 'assistant'
      && message.type === 'llm-text'
      && (!turnRef || message.turnRef === turnRef)
    ),
  );
  return lastMessage ? lastMessage.id : null;
}

function findFirstMessageIdBySender(
  messages: ChatStreamMessageTarget[],
  sender: string,
): string | null {
  const firstMessage = messages.find((message) => message.sender === sender);
  return firstMessage ? firstMessage.id : null;
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

export const DesktopChatStreamMessageUpdateRuntime = Object.freeze({
  buildToolSchemasUpdate,
  findLastMessageIdBySender,
  findLastAssistantLlmTextMessageId,
  findFirstMessageIdBySender,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  buildAssistantMessageFullUpdate,
});
