/**
 * Provides renderer message-list presentation state helpers for chat surfaces.
 */

const MESSAGE_LIST_BOTTOM_STICK_THRESHOLD_PX = 24;
const CONVERSATION_SWITCH_BOTTOM_OFFSET_PX = 72;
const AGENT_LOOP_AUTO_SCROLL_MESSAGE_TYPES = new Set([
  'llm-text',
  'tool-call',
  'tool-output',
  'tool-explanation',
  'tool-actions-summary',
  'search-source',
]);

function resolveElement(elementRef) {
  if (elementRef && Object.prototype.hasOwnProperty.call(elementRef, 'current')) {
    return elementRef.current;
  }
  return elementRef || null;
}

function resolveWindowApi(windowApi = globalThis.window) {
  return windowApi || {};
}

function isNearBottom(element) {
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

function scrollToBottom(element, behavior = 'smooth') {
  if (!element) {
    return;
  }
  const targetTop = Number(element.scrollHeight) || 0;
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top: targetTop, behavior });
    return;
  }
  element.scrollTop = targetTop;
}

function scrollToConversationSwitchTarget(element, behavior = 'auto') {
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

function scheduleMessageListScrollToBottom({
  elementRef,
  frameRef,
  behaviorRef,
  behavior = 'smooth',
  windowApi = globalThis.window,
} = {}) {
  if (!frameRef || !behaviorRef) {
    return null;
  }

  behaviorRef.current = (
    behaviorRef.current === 'auto' || behavior === 'auto'
  )
    ? 'auto'
    : 'smooth';

  if (frameRef.current !== null) {
    return frameRef.current;
  }

  const browserApi = resolveWindowApi(windowApi);
  const runScheduledScroll = () => {
    frameRef.current = null;
    const scheduledBehavior = behaviorRef.current || 'smooth';
    behaviorRef.current = null;
    scrollToBottom(resolveElement(elementRef), scheduledBehavior);
  };

  if (typeof browserApi.requestAnimationFrame === 'function') {
    frameRef.current = browserApi.requestAnimationFrame(runScheduledScroll);
    return frameRef.current;
  }

  frameRef.current = -1;
  runScheduledScroll();
  return null;
}

function clearScheduledMessageListScroll({
  frameRef,
  behaviorRef,
  windowApi = globalThis.window,
} = {}) {
  if (!frameRef || !behaviorRef) {
    return false;
  }

  const browserApi = resolveWindowApi(windowApi);
  if (
    frameRef.current !== null
    && frameRef.current !== -1
    && typeof browserApi.cancelAnimationFrame === 'function'
  ) {
    browserApi.cancelAnimationFrame(frameRef.current);
  }
  frameRef.current = null;
  behaviorRef.current = null;
  return true;
}

function scheduleActiveFindMatchScroll({
  messageListRef,
  activeFindMatchIndex,
  windowApi = globalThis.window,
} = {}) {
  if (activeFindMatchIndex === null || activeFindMatchIndex < 0) {
    return () => {};
  }

  const scrollActiveMatch = () => {
    const messageListNode = resolveElement(messageListRef);
    const activeMatchNode = messageListNode?.querySelector?.(
      `[data-thread-find-match-index="${activeFindMatchIndex}"]`,
    );
    if (activeMatchNode && typeof activeMatchNode.scrollIntoView === 'function') {
      activeMatchNode.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      });
    }
  };

  const browserApi = resolveWindowApi(windowApi);
  if (typeof browserApi.requestAnimationFrame !== 'function') {
    scrollActiveMatch();
    return () => {};
  }

  const frameId = browserApi.requestAnimationFrame(scrollActiveMatch);
  return () => {
    if (typeof browserApi.cancelAnimationFrame === 'function') {
      browserApi.cancelAnimationFrame(frameId);
    }
  };
}

function observeMessageListResize({
  elementRef,
  onResize,
  resizeObserverCtor = globalThis.ResizeObserver,
} = {}) {
  const element = resolveElement(elementRef);
  if (!element || typeof resizeObserverCtor !== 'function' || typeof onResize !== 'function') {
    return () => {};
  }

  const resizeObserver = new resizeObserverCtor(onResize);
  resizeObserver.observe(element);
  return () => {
    resizeObserver.disconnect();
  };
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

function shouldForceScrollForNewUserMessage(previousMessages, nextMessages) {
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

function shouldAutoScrollForAgentLoopMessageUpdate(previousMessages, nextMessages) {
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

function shouldAutoScrollForThinkingTextUpdate(previousMessages, nextMessages) {
  if (!Array.isArray(previousMessages) || !Array.isArray(nextMessages)) {
    return false;
  }
  if (previousMessages.length !== nextMessages.length || nextMessages.length === 0) {
    return false;
  }

  const previousLastMessage = previousMessages[previousMessages.length - 1] || null;
  const nextLastMessage = nextMessages[nextMessages.length - 1] || null;
  if (!previousLastMessage || !nextLastMessage || previousLastMessage.id !== nextLastMessage.id) {
    return false;
  }

  return (
    isAgentLoopAutoScrollEligibleMessage(nextLastMessage)
    && (nextLastMessage.type || '') === 'llm-text'
    && previousLastMessage.thinkingText !== nextLastMessage.thinkingText
  );
}

function shouldRenderAssistantActions(message, enableAssistantActions) {
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

function shouldRenderUserActions(message, enableUserActions) {
  return enableUserActions && message.sender === 'user';
}

function resolveCompactionStatusText(thinkingStatus, thinkingSourceEventType) {
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

export const DesktopMessageListRuntime = Object.freeze({
  isNearBottom,
  clearScheduledMessageListScroll,
  observeMessageListResize,
  scheduleActiveFindMatchScroll,
  scheduleMessageListScrollToBottom,
  scrollToBottom,
  scrollToConversationSwitchTarget,
  shouldForceScrollForNewUserMessage,
  shouldAutoScrollForAgentLoopMessageUpdate,
  shouldAutoScrollForThinkingTextUpdate,
  shouldRenderAssistantActions,
  shouldRenderUserActions,
  resolveCompactionStatusText,
});
