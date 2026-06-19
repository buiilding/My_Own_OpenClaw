/**
 * Provides renderer message transparency section descriptors for presentation surfaces.
 */

import { normalizeToolSchemaList } from './desktopChatMessageRuntimeClient';

function resolveMessageToolSchemas(message) {
  const toolSchemas = normalizeToolSchemaList(message?.toolSchemas);
  if (toolSchemas) {
    return toolSchemas;
  }
  const systemPromptToolSchemas = normalizeToolSchemaList(message?.systemPrompt?.toolSchemas);
  if (systemPromptToolSchemas) {
    return systemPromptToolSchemas;
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
  const conversationToolSchemas = normalizeToolSchemaList(options.conversationToolSchemas) || null;

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

export function serializeTransparencySectionContent(content) {
  if (content == null) {
    return '';
  }
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

export function resolveTransparencySectionContentPresentation(content, type = 'text') {
  if (content == null) {
    return {
      className: 'transparency-content-text',
      text: 'No content available',
    };
  }

  if (type === 'json' || type === 'system-prompt') {
    try {
      const jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
      return {
        className: 'transparency-content-json',
        text: JSON.stringify(jsonContent, null, 2),
      };
    } catch (_error) {
      return {
        className: 'transparency-content-text',
        text: String(content),
      };
    }
  }

  return {
    className: 'transparency-content-text',
    text: String(content),
  };
}
