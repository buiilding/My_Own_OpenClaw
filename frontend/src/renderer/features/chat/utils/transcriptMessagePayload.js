const TOOL_MESSAGE_TYPES = new Set(['tool-call', 'tool-output']);

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
  return {
    role,
    content: message.text || '',
    message_type: resolveTranscriptMessageType(message),
    tool_name: role === 'tool' ? (message.toolName || null) : null,
    correlation_id: role === 'tool' ? (message.correlationId || null) : null,
    timestamp: message.timestamp || null,
    screenshot_ref: typeof message.screenshotRef === 'string' ? message.screenshotRef : null,
    screenshot: null,
  };
}
