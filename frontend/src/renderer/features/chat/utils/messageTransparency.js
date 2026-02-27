function isCanonicalToolSchemas(value) {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => (
    item
    && typeof item === 'object'
    && item.type === 'function'
    && item.function
    && typeof item.function === 'object'
    && typeof item.function.name === 'string'
    && item.function.parameters
    && typeof item.function.parameters === 'object'
  ));
}

export function buildTransparencySectionConfigs(message) {
  const sections = [];

  if (message.systemPrompt) {
    sections.push({
      key: 'system-prompt',
      title: 'System Prompt',
      content: message.systemPrompt.content,
      metadata: null,
      type: 'system-prompt',
    });
  }

  if (isCanonicalToolSchemas(message.toolSchemas)) {
    sections.push({
      key: 'tool-schemas',
      title: 'Tool Schemas (Available Tools)',
      content: message.toolSchemas,
      type: 'json',
    });
  }

  if (message.fullUserMessage) {
    sections.push({
      key: 'user-message-full',
      title: 'Full Message Sent to Assistant (Complete)',
      content: message.fullUserMessage.content,
      metadata: { ...(message.fullUserMessage.metadata || {}) },
      type: 'xml',
    });
  }

  if (message.fullAssistantMessage) {
    sections.push({
      key: 'assistant-message-full',
      title: 'Full Assistant Message (Complete)',
      content: message.fullAssistantMessage.content,
      metadata: null,
      type: 'xml',
    });
  }

  return sections;
}
