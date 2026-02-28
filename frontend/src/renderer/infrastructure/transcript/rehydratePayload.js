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

function resolveTransparencyToolSchemas(
  primaryToolSchemas,
  fallbackToolSchemas,
) {
  if (Array.isArray(primaryToolSchemas) && primaryToolSchemas.length > 0) {
    return primaryToolSchemas;
  }
  if (Array.isArray(fallbackToolSchemas) && fallbackToolSchemas.length > 0) {
    return fallbackToolSchemas;
  }
  return null;
}

function normalizeFullMessagePayload(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
    return null;
  }
  const content = normalizeOptionalString(rawMessage.content);
  const metadata = cloneObject(rawMessage.metadata);
  if (!content && !metadata) {
    return null;
  }
  return {
    ...(content ? { content } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function normalizeTranscriptTransparency(rawTransparency) {
  if (!rawTransparency || typeof rawTransparency !== 'object' || Array.isArray(rawTransparency)) {
    return null;
  }

  const transparency = {};
  const systemPrompt = normalizeOptionalString(rawTransparency.systemPrompt);
  if (systemPrompt) {
    transparency.systemPrompt = systemPrompt;
  }

  const toolSchemas = resolveTransparencyToolSchemas(
    rawTransparency.toolSchemas,
    null,
  );
  if (toolSchemas) {
    transparency.toolSchemas = toolSchemas;
  }

  const fullUserMessage = normalizeFullMessagePayload(rawTransparency.fullUserMessage);
  if (fullUserMessage) {
    transparency.fullUserMessage = fullUserMessage;
  }

  const fullAssistantContent = normalizeOptionalString(rawTransparency?.fullAssistantMessage?.content);
  if (fullAssistantContent) {
    transparency.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return Object.keys(transparency).length > 0 ? transparency : null;
}

export function buildTranscriptTransparencyFromChatMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const systemPromptContent = normalizeOptionalString(message?.systemPrompt?.content);
  const toolSchemas = resolveTransparencyToolSchemas(
    message?.toolSchemas,
    message?.systemPrompt?.toolSchemas,
  );
  const fullUserMessage = normalizeFullMessagePayload(message?.fullUserMessage);
  const fullAssistantContent = normalizeOptionalString(message?.fullAssistantMessage?.content);

  const transparency = {};
  if (systemPromptContent) {
    transparency.systemPrompt = systemPromptContent;
  }
  if (toolSchemas) {
    transparency.toolSchemas = toolSchemas;
  }
  if (fullUserMessage) {
    transparency.fullUserMessage = fullUserMessage;
  }
  if (fullAssistantContent) {
    transparency.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return Object.keys(transparency).length > 0 ? transparency : null;
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
