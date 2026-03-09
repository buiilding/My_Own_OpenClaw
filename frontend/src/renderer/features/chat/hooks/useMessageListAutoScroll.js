import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  isNearBottom,
  scrollToConversationSwitchTarget,
  shouldAutoScrollForAgentLoopMessageUpdate,
  shouldForceScrollForNewUserMessage,
} from '../utils/message/messageListState';

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
    nextLastMessage.sender === 'assistant'
    && nextLastMessage.type === 'llm-text'
    && previousLastMessage.thinkingText !== nextLastMessage.thinkingText
  );
}

export function useMessageListAutoScroll({
  messages,
  conversationRef,
  awaitingDotTargetMessageId = null,
  enableAgentLoopAutoScroll = false,
}) {
  const messageListRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const forceInstantAutoScrollRef = useRef(false);
  const skipNextMessagesAutoScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const previousMessagesRef = useRef(messages);
  const previousAwaitingDotTargetMessageIdRef = useRef(awaitingDotTargetMessageId);

  const syncScrollMetrics = useCallback(() => {
    const element = messageListRef.current;
    if (!element) {
      lastScrollTopRef.current = 0;
      lastScrollHeightRef.current = 0;
      return;
    }
    lastScrollTopRef.current = Number(element.scrollTop) || 0;
    lastScrollHeightRef.current = Number(element.scrollHeight) || 0;
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const element = messageListRef.current;
    if (!element) {
      return;
    }
    const targetTop = Number(element.scrollHeight) || 0;
    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: targetTop, behavior });
      return;
    }
    element.scrollTop = targetTop;
  }, []);

  useEffect(() => {
    if (conversationRef === undefined) {
      return;
    }
    shouldAutoScrollRef.current = true;
    skipNextMessagesAutoScrollRef.current = true;
    forceInstantAutoScrollRef.current = true;
    scrollToConversationSwitchTarget(messageListRef.current, 'auto');
    syncScrollMetrics();
  }, [conversationRef, syncScrollMetrics]);

  const handleMessageListScroll = useCallback(() => {
    const element = messageListRef.current;
    const nextScrollTop = Number(element?.scrollTop) || 0;
    const nextScrollHeight = Number(element?.scrollHeight) || 0;
    const nearBottom = isNearBottom(element);
    const hasKnownScrollMetrics = lastScrollHeightRef.current > 0 || lastScrollTopRef.current > 0;

    if (!hasKnownScrollMetrics) {
      shouldAutoScrollRef.current = nearBottom;
      lastScrollTopRef.current = nextScrollTop;
      lastScrollHeightRef.current = nextScrollHeight;
      return;
    }

    const scrolledUp = nextScrollTop < lastScrollTopRef.current;
    const contentGrewWithoutUpwardScroll = (
      shouldAutoScrollRef.current
      && nextScrollHeight > lastScrollHeightRef.current
      && nextScrollTop >= lastScrollTopRef.current
    );

    if (nearBottom) {
      shouldAutoScrollRef.current = true;
    } else if (shouldAutoScrollRef.current) {
      shouldAutoScrollRef.current = !scrolledUp || contentGrewWithoutUpwardScroll;
    }

    lastScrollTopRef.current = nextScrollTop;
    lastScrollHeightRef.current = nextScrollHeight;
  }, []);

  useEffect(() => {
    syncScrollMetrics();
  }, [messages, awaitingDotTargetMessageId, syncScrollMetrics]);

  useEffect(() => {
    const element = messageListRef.current;
    if (!element || typeof ResizeObserver !== 'function') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      const currentElement = messageListRef.current;
      if (!currentElement) {
        return;
      }

      const nextScrollHeight = Number(currentElement.scrollHeight) || 0;
      const scrollHeightChanged = nextScrollHeight !== lastScrollHeightRef.current;
      if (scrollHeightChanged && enableAgentLoopAutoScroll && shouldAutoScrollRef.current) {
        scrollToBottom(forceInstantAutoScrollRef.current ? 'auto' : 'smooth');
        forceInstantAutoScrollRef.current = false;
      }

      lastScrollTopRef.current = Number(currentElement.scrollTop) || 0;
      lastScrollHeightRef.current = nextScrollHeight;
    });

    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [enableAgentLoopAutoScroll, scrollToBottom]);

  useEffect(() => {
    const previousMessages = previousMessagesRef.current;
    const shouldForceScroll = shouldForceScrollForNewUserMessage(previousMessages, messages);

    if (skipNextMessagesAutoScrollRef.current) {
      skipNextMessagesAutoScrollRef.current = false;
      forceInstantAutoScrollRef.current = false;
      previousMessagesRef.current = messages;
      return;
    }

    if (shouldForceScroll) {
      shouldAutoScrollRef.current = true;
      const behavior = 'auto';
      forceInstantAutoScrollRef.current = false;
      previousMessagesRef.current = messages;
      scrollToBottom(behavior);
      return;
    }

    if (!shouldAutoScrollRef.current) {
      previousMessagesRef.current = messages;
      return;
    }

    const shouldAutoScroll = enableAgentLoopAutoScroll
      && (
        shouldAutoScrollForAgentLoopMessageUpdate(previousMessages, messages)
        || shouldAutoScrollForThinkingTextUpdate(previousMessages, messages)
      );
    previousMessagesRef.current = messages;
    if (!shouldAutoScroll) {
      return;
    }

    const behavior = forceInstantAutoScrollRef.current ? 'auto' : 'smooth';
    forceInstantAutoScrollRef.current = false;
    scrollToBottom(behavior);
  }, [enableAgentLoopAutoScroll, messages, scrollToBottom]);

  useEffect(() => {
    const previousAwaitingDotTargetMessageId = previousAwaitingDotTargetMessageIdRef.current;
    const awaitingDotChanged = previousAwaitingDotTargetMessageId !== awaitingDotTargetMessageId;
    previousAwaitingDotTargetMessageIdRef.current = awaitingDotTargetMessageId;

    if (!awaitingDotChanged) {
      return;
    }
    if (!enableAgentLoopAutoScroll) {
      return;
    }
    if (!shouldAutoScrollRef.current) {
      return;
    }
    if (!awaitingDotTargetMessageId) {
      return;
    }

    scrollToBottom('auto');
  }, [awaitingDotTargetMessageId, enableAgentLoopAutoScroll, scrollToBottom]);

  return {
    messageListRef,
    handleMessageListScroll,
  };
}

export default useMessageListAutoScroll;
