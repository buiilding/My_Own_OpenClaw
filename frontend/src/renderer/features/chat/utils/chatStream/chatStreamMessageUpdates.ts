/**
 * Provides the chat stream message updates module for the renderer UI.
 */

import type { ToolSchema } from '../../../../types/toolSchemas';
import type { ChatMessage } from '../../stores/chatStore';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import { normalizeToolSchemaList } from '../../../../infrastructure/transcript/toolSchemaShape';

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

export function buildToolSchemasUpdate(payload: { tool_schemas?: unknown } | null | undefined) {
  return {
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

function findLastMessage(
  messages: ChatMessage[],
  predicate: (message: ChatMessage) => boolean,
): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (predicate(message)) {
      return message;
    }
  }
  return null;
}

export function findLastMessageIdBySender(
  messages: ChatMessage[],
  sender: ChatMessage['sender'],
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

export function findLastAssistantLlmTextMessageId(
  messages: ChatMessage[],
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

export function findFirstMessageIdBySender(
  messages: ChatMessage[],
  sender: ChatMessage['sender'],
): string | null {
  const firstMessage = messages.find((message) => message.sender === sender);
  return firstMessage ? firstMessage.id : null;
}

export function buildSystemPromptUpdate(payload: SystemPromptPayload | null | undefined) {
  return {
    content: normalizeIncomingText(payload?.content),
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

export function buildUserMessageFullUpdate(payload: UserMessageFullPayload | null | undefined) {
  const metadata = payload?.metadata;
  return {
    content: normalizeIncomingText(payload?.content),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : undefined,
  };
}

export function buildAssistantMessageFullUpdate(payload: AssistantMessageFullPayload | null | undefined) {
  return {
    content: normalizeIncomingText(payload?.content),
  };
}
