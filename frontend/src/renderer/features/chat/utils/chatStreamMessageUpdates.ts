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
  | { type: 'new'; text: string };

export function findLastMessageIdBySender(
  messages: ChatMessage[],
  sender: ChatMessage['sender'],
): string | null {
  const lastMessage = messages.findLast((message) => message.sender === sender);
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
): StreamingResponseAction {
  const normalizedChunkText = typeof chunkText === 'string' ? chunkText : '';
  const lastMessage = messages[messages.length - 1];
  if (
    lastMessage
    && lastMessage.sender === 'assistant'
    && !lastMessage.isComplete
    && lastMessage.type === 'llm-text'
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
  };
}

export function findStreamingCompleteAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
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
    toolSchemas: payload?.tool_schemas,
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
