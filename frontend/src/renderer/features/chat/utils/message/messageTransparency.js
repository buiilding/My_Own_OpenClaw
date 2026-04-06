import { isSupportedToolSchemaList } from '../../../../infrastructure/transcript/toolSchemaShape';

function isCanonicalToolSchemas(value) {
  return isSupportedToolSchemaList(value);
}

function resolveMessageToolSchemas(message) {
  if (isCanonicalToolSchemas(message?.toolSchemas)) {
    return message.toolSchemas;
  }
  if (isCanonicalToolSchemas(message?.systemPrompt?.toolSchemas)) {
    return message.systemPrompt.toolSchemas;
  }
  return null;
}

export function resolveConversationToolSchemas(messages) {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const toolSchemas = resolveMessageToolSchemas(messages[index]);
    if (toolSchemas) {
      return toolSchemas;
    }
  }

  return null;
}

export function buildTransparencySectionConfigs(message, options = {}) {
  const sections = [];
  const conversationToolSchemas = isCanonicalToolSchemas(options.conversationToolSchemas)
    ? options.conversationToolSchemas
    : null;

  if (message.systemPrompt) {
    sections.push({
      key: 'system-prompt',
      title: 'System Prompt',
      content: message.systemPrompt.content,
      metadata: null,
      type: 'system-prompt',
    });
  }

  const resolvedToolSchemas = resolveMessageToolSchemas(message)
    || (message.sender === 'user' ? conversationToolSchemas : null);
  if (resolvedToolSchemas) {
    sections.push({
      key: 'tool-schemas',
      title: 'Tool Schemas (Available Tools)',
      content: resolvedToolSchemas,
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
