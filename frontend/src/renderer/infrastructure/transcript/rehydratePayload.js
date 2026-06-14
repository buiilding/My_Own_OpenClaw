/**
 * Provides the rehydrate payload module for the renderer UI.
 */

import { normalizeToolSchemaList } from './toolSchemaShape';
import { normalizeTransparencyData } from './transparencyNormalization';

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMessageType(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replaceAll('_', '-')
    : '';
}

function cloneObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

export function normalizeTranscriptTransparency(rawTransparency) {
  return normalizeTransparencyData(rawTransparency);
}

export function buildTranscriptTransparencyFromChatMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const toolSchemas = normalizeToolSchemaList(message?.toolSchemas)
    || normalizeToolSchemaList(message?.systemPrompt?.toolSchemas)
    || undefined;

  return normalizeTransparencyData({
    systemPrompt: message?.systemPrompt?.content,
    ...(toolSchemas ? { toolSchemas } : {}),
    fullUserMessage: (
      message?.fullUserMessage
      && typeof message.fullUserMessage === 'object'
      && !Array.isArray(message.fullUserMessage)
    ) ? {
      content: message.fullUserMessage.content,
      metadata: cloneObject(message.fullUserMessage.metadata),
    } : undefined,
    fullAssistantMessage: (
      message?.fullAssistantMessage
      && typeof message.fullAssistantMessage === 'object'
      && !Array.isArray(message.fullAssistantMessage)
    ) ? {
      content: message.fullAssistantMessage.content,
    } : undefined,
  });
}

export function resolveRehydrateContent({
  role,
  messageType,
  content,
  transparency,
}) {
  const baseContent = typeof content === 'string' ? content : '';
  if (!transparency || typeof transparency !== 'object') {
    return baseContent;
  }

  if (role === 'user') {
    return normalizeOptionalString(transparency?.fullUserMessage?.content) || baseContent;
  }

  if (role === 'assistant' && normalizeMessageType(messageType) === 'llm-text') {
    return normalizeOptionalString(transparency?.fullAssistantMessage?.content) || baseContent;
  }

  return baseContent;
}

export function parseToolCallPayload(rawContent) {
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (_error) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const functionBlock = cloneObject(parsed.function);
  const name = normalizeOptionalString(parsed.name || functionBlock?.name);
  const callId = normalizeOptionalString(parsed.id || functionBlock?.id);
  const thoughtSignature = normalizeOptionalString(
    parsed.thought_signature
      || parsed.thoughtSignature
      || functionBlock?.thought_signature
      || functionBlock?.thoughtSignature,
  );

  let argumentsPayload = {};
  if (cloneObject(parsed.arguments)) {
    argumentsPayload = parsed.arguments;
  } else if (cloneObject(parsed.args)) {
    argumentsPayload = parsed.args;
  } else if (typeof functionBlock?.arguments === 'string' && functionBlock.arguments.trim()) {
    try {
      const decoded = JSON.parse(functionBlock.arguments);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        argumentsPayload = decoded;
      }
    } catch (_error) {
      argumentsPayload = {};
    }
  } else if (cloneObject(functionBlock?.arguments)) {
    argumentsPayload = functionBlock.arguments;
  }

  if (!name && !callId) {
    return null;
  }

  return {
    id: callId || undefined,
    name: name || undefined,
    arguments: { ...argumentsPayload },
    thought_signature: thoughtSignature || undefined,
  };
}

export function buildRehydrateToolCall({
  parsedToolCall,
  fallbackToolName,
  fallbackToolCallId,
}) {
  if (!parsedToolCall && !fallbackToolName && !fallbackToolCallId) {
    return null;
  }
  const toolCall = {
    id: parsedToolCall?.id || fallbackToolCallId || undefined,
    name: parsedToolCall?.name || fallbackToolName || undefined,
    arguments: parsedToolCall?.arguments || {},
    thought_signature: parsedToolCall?.thought_signature || undefined,
  };
  if (!toolCall.id && !toolCall.name) {
    return null;
  }
  return toolCall;
}

export {
  normalizeMessageType,
  normalizeOptionalString,
};
