const MESSAGE_LIST_BOTTOM_STICK_THRESHOLD_PX = 24;
const CONVERSATION_SWITCH_BOTTOM_OFFSET_PX = 72;
const AGENT_LOOP_AUTO_SCROLL_MESSAGE_TYPES = new Set([
  'llm-text',
  'tool-call',
  'tool-output',
  'tool-explanation',
  'search-source',
  'tool-actions-summary',
]);

export function isNearBottom(element) {
  if (!element) {
    return true;
  }
  const scrollHeight = Number(element.scrollHeight) || 0;
  const clientHeight = Number(element.clientHeight) || 0;
  const scrollTop = Number(element.scrollTop) || 0;
  const distanceFromBottom = scrollHeight - clientHeight - scrollTop;

  if (!Number.isFinite(distanceFromBottom)) {
    return true;
  }

  return distanceFromBottom <= MESSAGE_LIST_BOTTOM_STICK_THRESHOLD_PX;
}

export function scrollToConversationSwitchTarget(element, behavior = 'auto') {
  if (!element) {
    return;
  }
  const scrollHeight = Number(element.scrollHeight) || 0;
  const clientHeight = Number(element.clientHeight) || 0;
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const targetTop = Math.max(0, maxScrollTop - CONVERSATION_SWITCH_BOTTOM_OFFSET_PX);

  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top: targetTop, behavior });
    return;
  }
  element.scrollTop = targetTop;
}

function isAgentLoopAutoScrollEligibleMessage(message) {
  if (!message || message.sender !== 'assistant') {
    return false;
  }
  return AGENT_LOOP_AUTO_SCROLL_MESSAGE_TYPES.has(message.type || '');
}

function isUserMessage(message) {
  return Boolean(message) && message.sender === 'user';
}

export function shouldForceScrollForNewUserMessage(previousMessages, nextMessages) {
  if (!Array.isArray(previousMessages) || !Array.isArray(nextMessages)) {
    return false;
  }
  if (nextMessages.length <= previousMessages.length) {
    return false;
  }

  return nextMessages
    .slice(previousMessages.length)
    .some(isUserMessage);
}

export function shouldAutoScrollForAgentLoopMessageUpdate(previousMessages, nextMessages) {
  if (!Array.isArray(previousMessages) || !Array.isArray(nextMessages)) {
    return false;
  }
  if (previousMessages.length === 0 || nextMessages.length === 0) {
    return false;
  }

  if (nextMessages.length > previousMessages.length) {
    return nextMessages
      .slice(previousMessages.length)
      .some(isAgentLoopAutoScrollEligibleMessage);
  }

  const previousLastMessage = previousMessages[previousMessages.length - 1] || null;
  const nextLastMessage = nextMessages[nextMessages.length - 1] || null;

  if (!isAgentLoopAutoScrollEligibleMessage(nextLastMessage)) {
    return false;
  }

  if (!previousLastMessage || previousLastMessage.id !== nextLastMessage.id) {
    return false;
  }

  return (
    previousLastMessage.text !== nextLastMessage.text
    || previousLastMessage.isComplete !== nextLastMessage.isComplete
  );
}

export function shouldRenderAssistantActions(message, enableAssistantActions) {
  if (!enableAssistantActions) {
    return false;
  }
  if (message.sender !== 'assistant') {
    return false;
  }
  const normalizedType = typeof message.type === 'string' && message.type.trim()
    ? message.type
    : 'llm-text';
  if (normalizedType !== 'llm-text') {
    return false;
  }
  return message.isComplete !== false;
}

export function shouldRenderUserActions(message, enableUserActions) {
  return enableUserActions && message.sender === 'user';
}

export function resolveCompactionStatusText(thinkingStatus, thinkingSourceEventType) {
  if (typeof thinkingStatus !== 'string') {
    return null;
  }
  const text = thinkingStatus.trim();
  if (!text) {
    return null;
  }
  if (thinkingSourceEventType === 'context-compaction-started') {
    return {
      text,
      state: 'in-progress',
      ariaLabel: 'Conversation compaction in progress',
    };
  }
  if (thinkingSourceEventType === 'context-compaction-completed') {
    return {
      text,
      state: 'completed',
      ariaLabel: 'Conversation compaction completed',
    };
  }
  if (thinkingSourceEventType === 'context-compaction-failed') {
    return {
      text,
      state: 'failed',
      ariaLabel: 'Conversation compaction failed',
    };
  }
  return null;
}
