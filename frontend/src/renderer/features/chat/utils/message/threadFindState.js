/**
 * Provides the thread find state module for the renderer UI.
 */

import { collectTextMatches } from '../../../../infrastructure/markdown';
import { buildMarkdownRenderModel } from './markdownMessageRendering';

function resolveToolCallSearchText(message) {
  if (typeof message?.toolCallDisplayText === 'string' && message.toolCallDisplayText.trim()) {
    return message.toolCallDisplayText;
  }

  if (
    message?.modelFacingToolCall
    && typeof message.modelFacingToolCall === 'object'
    && !Array.isArray(message.modelFacingToolCall)
  ) {
    return JSON.stringify(message.modelFacingToolCall, null, 2);
  }

  return '';
}

function resolveToolOutputSearchText(message) {
  if (typeof message?.modelFacingToolOutput === 'string') {
    return message.modelFacingToolOutput;
  }
  return typeof message?.text === 'string' ? message.text : '';
}

function resolveSearchableMessageText(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  if (message.type === 'tool-actions-summary') {
    return '';
  }

  if (message.type === 'tool-call') {
    return resolveToolCallSearchText(message);
  }

  if (message.type === 'tool-output') {
    return resolveToolOutputSearchText(message);
  }

  if (message.type === 'tool-explanation' || message.type === 'search-source' || message.type === 'error') {
    return typeof message.text === 'string' ? message.text : '';
  }

  return buildMarkdownRenderModel({
    text: message.text ?? '',
    sender: message.sender ?? 'assistant',
    modelProvider: message.modelProvider ?? null,
    modelId: message.modelId ?? null,
  }).plainText;
}

export function buildThreadFindState(messages, query) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';
  if (!normalizedQuery || normalizedMessages.length === 0) {
    return {
      totalMatches: 0,
      messageMatchIndexesById: {},
    };
  }

  let nextMatchIndex = 0;
  const messageMatchIndexesById = {};

  normalizedMessages.forEach((message) => {
    const searchableText = resolveSearchableMessageText(message);
    const localMatches = collectTextMatches(searchableText, normalizedQuery);
    if (localMatches.length === 0) {
      return;
    }

    const globalMatchIndexes = localMatches.map(() => {
      const currentIndex = nextMatchIndex;
      nextMatchIndex += 1;
      return currentIndex;
    });

    messageMatchIndexesById[message.id] = globalMatchIndexes;
  });

  return {
    totalMatches: nextMatchIndex,
    messageMatchIndexesById,
  };
}
