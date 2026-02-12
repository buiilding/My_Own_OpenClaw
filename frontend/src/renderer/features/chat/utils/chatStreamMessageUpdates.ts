import type { ToolSchema } from '../../../types/backendEvents';
import type { ChatMessage } from '../stores/chatStore';

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

export type StreamingResponseAction =
  | { type: 'append'; messageId: string; nextText: string }
  | { type: 'new'; text: string; turnRef?: string };

function normalizeToolSchemas(value: unknown): ToolSchema[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const isCanonicalList = value.every((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const tool = item as { type?: unknown; function?: unknown };
    if (tool.type !== 'function' || !tool.function || typeof tool.function !== 'object') {
      return false;
    }

    const fn = tool.function as { name?: unknown; parameters?: unknown };
    return typeof fn.name === 'string' && typeof fn.parameters === 'object' && fn.parameters !== null;
  });

  return isCanonicalList ? (value as ToolSchema[]) : undefined;
}

export function findLastMessageIdBySender(
  messages: ChatMessage[],
  sender: ChatMessage['sender'],
  turnRef?: string,
): string | null {
  const lastMessage = messages.findLast(
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
  const lastMessage = messages.findLast(
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
  const normalizedChunkText = typeof chunkText === 'string' ? chunkText : '';
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
  const withTurnRef = turnRef
    ? messages.findLast(
      (message) => (
        message.sender === 'assistant'
        && (!message.type || message.type === 'llm-text')
        && message.turnRef === turnRef
      ),
    )
    : null;
  if (withTurnRef) {
    return withTurnRef;
  }
  return (
    messages.findLast(
      (message) => message.sender === 'assistant' && (!message.type || message.type === 'llm-text'),
    )
    || null
  );
}

export function buildSystemPromptUpdate(payload: SystemPromptPayload | null | undefined) {
  return {
    content: typeof payload?.content === 'string' ? payload.content : '',
    toolSchemas: normalizeToolSchemas(payload?.tool_schemas),
  };
}

export function buildUserMessageFullUpdate(payload: UserMessageFullPayload | null | undefined) {
  return {
    content: typeof payload?.content === 'string' ? payload.content : '',
    metadata: payload?.metadata,
  };
}

export function buildAssistantMessageFullUpdate(payload: AssistantMessageFullPayload | null | undefined) {
  return {
    content: typeof payload?.content === 'string' ? payload.content : '',
  };
}
