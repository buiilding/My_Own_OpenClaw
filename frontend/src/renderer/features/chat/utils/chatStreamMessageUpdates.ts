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

type StreamingResponseAction =
  | { type: 'append'; messageId: string; nextText: string }
  | { type: 'new'; text: string; turnRef?: string };

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ['â€œ', '“'],
  ['â€\u009d', '”'],
  ['â€˜', '‘'],
  ['â€™', '’'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€¦', '…'],
  ['â€¢', '•'],
  ['Â ', ' '],
  ['Â', ''],
];

function replaceLoneSurrogates(value: string): string {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    const isHighSurrogate = codeUnit >= 0xD800 && codeUnit <= 0xDBFF;
    const isLowSurrogate = codeUnit >= 0xDC00 && codeUnit <= 0xDFFF;

    if (!isHighSurrogate && !isLowSurrogate) {
      normalized += value[index];
      continue;
    }

    if (isHighSurrogate) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      const nextIsLowSurrogate = nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF;
      if (nextIsLowSurrogate) {
        normalized += value[index] + value[index + 1];
        index += 1;
        continue;
      }
    }

    normalized += '\uFFFD';
  }

  return normalized;
}

function normalizeIncomingText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  let repaired = value;
  for (const [needle, replacement] of MOJIBAKE_REPLACEMENTS) {
    repaired = repaired.split(needle).join(replacement);
  }
  return replaceLoneSurrogates(repaired);
}

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
  const withTurnRef = turnRef
    ? findLastMessage(
      messages,
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
