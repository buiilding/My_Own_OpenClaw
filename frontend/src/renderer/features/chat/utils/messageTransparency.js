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

  if (message.toolSchemas) {
    sections.push({
      key: 'tool-schemas',
      title: 'Tool Schemas (Available Tools - Embedded in Initial User Message)',
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
      title: 'Full Assistant Response',
      content: message.fullAssistantMessage.content,
      type: 'text',
    });
  }

  return sections;
}
