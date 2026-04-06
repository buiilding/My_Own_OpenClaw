import type { ToolSchema } from '../../../../types/backendEvents';
import type { ChatMessage } from '../../stores/chatStore';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import { isSupportedToolSchemaList } from '../../../../infrastructure/transcript/toolSchemaShape';

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

type StreamingResponseAction =
  | { type: 'append'; messageId: string; nextText: string }
  | { type: 'new'; text: string; turnRef?: string };

function normalizeToolSchemas(value: unknown): ToolSchema[] | undefined {
  return isSupportedToolSchemaList(value) ? value : undefined;
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

export function resolveStreamingResponseAction(
  messages: ChatMessage[],
  chunkText: unknown,
  turnRef?: string,
): StreamingResponseAction {
  const normalizedChunkText = normalizeIncomingText(chunkText);
  const lastMessage = messages[messages.length - 1];
  if (
    lastMessage
    && lastMessage.sender === 'assistant'
    && !lastMessage.isComplete
    && lastMessage.type === 'llm-text'
    && (!turnRef || lastMessage.turnRef === turnRef)
  ) {
    return {
      type: 'append',
      messageId: lastMessage.id,
      nextText: `${lastMessage.text}${normalizedChunkText}`,
    };
  }
  return {
    type: 'new',
    text: normalizedChunkText,
    turnRef,
  };
}

export function findStreamingCompleteAssistantMessage(
  messages: ChatMessage[],
  turnRef?: string,
): ChatMessage | null {
  if (turnRef) {
    return (
      findLastMessage(
      messages,
      (message) => (
        message.sender === 'assistant'
        && (!message.type || message.type === 'llm-text')
        && message.turnRef === turnRef
      ),
      )
      || null
    );
  }
  return (
    findLastMessage(
      messages,
      (message) => message.sender === 'assistant' && (!message.type || message.type === 'llm-text'),
    )
    || null
  );
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
