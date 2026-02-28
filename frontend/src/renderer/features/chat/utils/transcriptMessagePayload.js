const TOOL_MESSAGE_TYPES = new Set(['tool-call', 'tool-output']);

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeToolCall(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }
  const rawToolCall = (
    message.modelFacingToolCall
    && typeof message.modelFacingToolCall === 'object'
    && !Array.isArray(message.modelFacingToolCall)
  ) ? message.modelFacingToolCall : null;
  if (!rawToolCall) {
    return null;
  }

  const callId = normalizeOptionalString(rawToolCall.id);
  const callName = normalizeOptionalString(rawToolCall.name);
  const thoughtSignature = normalizeOptionalString(
    rawToolCall.thought_signature || rawToolCall.thoughtSignature,
  );
  const callArguments = (
    rawToolCall.arguments
    && typeof rawToolCall.arguments === 'object'
    && !Array.isArray(rawToolCall.arguments)
  ) ? rawToolCall.arguments : {};

  if (!callId && !callName) {
    return null;
  }

  return {
    id: callId || undefined,
    name: callName || undefined,
    arguments: { ...callArguments },
    thought_signature: thoughtSignature || undefined,
  };
}

function normalizeTransparency(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const transparency = {};
  const systemPromptContent = normalizeOptionalString(message?.systemPrompt?.content);
  if (systemPromptContent) {
    transparency.systemPrompt = systemPromptContent;
  }

  const toolSchemas = (
    Array.isArray(message?.toolSchemas) && message.toolSchemas.length > 0
  )
    ? message.toolSchemas
    : (
      Array.isArray(message?.systemPrompt?.toolSchemas) && message.systemPrompt.toolSchemas.length > 0
        ? message.systemPrompt.toolSchemas
        : null
    );
  if (toolSchemas) {
    transparency.toolSchemas = toolSchemas;
  }

  const fullUserContent = normalizeOptionalString(message?.fullUserMessage?.content);
  const fullUserMetadata = (
    message?.fullUserMessage?.metadata
    && typeof message.fullUserMessage.metadata === 'object'
    && !Array.isArray(message.fullUserMessage.metadata)
  ) ? { ...message.fullUserMessage.metadata } : null;
  if (fullUserContent || fullUserMetadata) {
    transparency.fullUserMessage = {
      ...(fullUserContent ? { content: fullUserContent } : {}),
      ...(fullUserMetadata ? { metadata: fullUserMetadata } : {}),
    };
  }

  const fullAssistantContent = normalizeOptionalString(message?.fullAssistantMessage?.content);
  if (fullAssistantContent) {
    transparency.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return Object.keys(transparency).length > 0 ? transparency : null;
}

export function normalizeProvider(provider) {
  return provider === undefined || provider === null
    ? ''
    : String(provider).trim().toLowerCase();
}

export function resolveTranscriptRole(message) {
  if (message.sender === 'user') {
    return 'user';
  }
  if (message.type && TOOL_MESSAGE_TYPES.has(message.type)) {
    return 'tool';
  }
  return 'assistant';
}

export function resolveTranscriptMessageType(message) {
  if (message.sender === 'user') {
    return 'user';
  }
  return message.type || 'llm-text';
}

export function toRehydratePayload(message) {
  const role = resolveTranscriptRole(message);
  const messageType = resolveTranscriptMessageType(message);
  const toolCall = normalizeToolCall(message);
  const toolCallId = role === 'tool'
    ? (normalizeOptionalString(message.correlationId) || toolCall?.id || null)
    : null;
  const toolName = role === 'tool'
    ? (normalizeOptionalString(message.toolName) || toolCall?.name || null)
    : null;
  const transparency = normalizeTransparency(message);
  const content = role === 'user'
    ? (normalizeOptionalString(message?.fullUserMessage?.content) || message.text || '')
    : (
      role === 'assistant' && messageType === 'llm-text'
        ? (normalizeOptionalString(message?.fullAssistantMessage?.content) || message.text || '')
        : (message.text || '')
    );

  return {
    role,
    content,
    message_type: messageType,
    tool_name: toolName,
    correlation_id: role === 'tool' ? (message.correlationId || null) : null,
    tool_call_id: toolCallId,
    tool_calls: role === 'tool' && messageType === 'tool-call' && toolCall
      ? [{
        id: toolCall.id || toolCallId || undefined,
        name: toolCall.name || toolName || undefined,
        arguments: toolCall.arguments || {},
        thought_signature: toolCall.thought_signature || undefined,
      }]
      : null,
    timestamp: message.timestamp || null,
    screenshot_ref: typeof message.screenshotRef === 'string' ? message.screenshotRef : null,
    screenshot: null,
    transparency,
  };
}
