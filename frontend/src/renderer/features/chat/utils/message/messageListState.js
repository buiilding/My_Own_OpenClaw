const MESSAGE_LIST_BOTTOM_STICK_THRESHOLD_PX = 24;
const CONVERSATION_SWITCH_BOTTOM_OFFSET_PX = 72;

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

export function shouldRenderAssistantActions(message, enableAssistantActions) {
  if (!enableAssistantActions) {
    return false;
  }
  if (message.sender !== 'assistant') {
    return false;
  }
  return message.type !== 'tool-call' && message.type !== 'tool-output';
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
