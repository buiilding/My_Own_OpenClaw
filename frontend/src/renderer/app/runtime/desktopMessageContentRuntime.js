/**
 * Resolves renderer message content presentation kinds for chat surfaces.
 */

import { isUserMessageWithScreenshot } from './desktopMessageScreenshotRuntime';

export const MESSAGE_CONTENT_RENDER_KIND = Object.freeze({
  ERROR: 'error',
  TOOL_OUTPUT: 'tool-output',
  TOOL_CALL: 'tool-call',
  TOOL_EXPLANATION: 'tool-explanation',
  TOOL_ACTIONS_SUMMARY: 'tool-actions-summary',
  USER_WITH_SCREENSHOT: 'user-with-screenshot',
  ASSISTANT_RESPONSE: 'assistant-response',
  MARKDOWN: 'markdown',
});

function normalizeText(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isAssistantLlmTextMessage(message) {
  return (
    message?.sender === 'assistant'
    && (!message.type || message.type === 'llm-text')
  );
}

export function resolveMessageContentPresentation(message) {
  if (message?.type === 'error') {
    return { renderKind: MESSAGE_CONTENT_RENDER_KIND.ERROR };
  }

  if (message?.type === 'tool-output') {
    return { renderKind: MESSAGE_CONTENT_RENDER_KIND.TOOL_OUTPUT };
  }

  if (message?.type === 'tool-call') {
    return { renderKind: MESSAGE_CONTENT_RENDER_KIND.TOOL_CALL };
  }

  if (message?.type === 'tool-explanation' || message?.type === 'search-source') {
    return { renderKind: MESSAGE_CONTENT_RENDER_KIND.TOOL_EXPLANATION };
  }

  if (message?.type === 'tool-actions-summary') {
    return { renderKind: MESSAGE_CONTENT_RENDER_KIND.TOOL_ACTIONS_SUMMARY };
  }

  if (isUserMessageWithScreenshot(message)) {
    return { renderKind: MESSAGE_CONTENT_RENDER_KIND.USER_WITH_SCREENSHOT };
  }

  if (isAssistantLlmTextMessage(message)) {
    return {
      renderKind: MESSAGE_CONTENT_RENDER_KIND.ASSISTANT_RESPONSE,
      hasVisibleAssistantText: Boolean(normalizeText(message.text)),
    };
  }

  return { renderKind: MESSAGE_CONTENT_RENDER_KIND.MARKDOWN };
}
