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
  const previousMessagesRef = useRef(messages);
  const previousAwaitingDotTargetMessageIdRef = useRef(awaitingDotTargetMessageId);

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
  }, [conversationRef]);

  const handleMessageListScroll = useCallback(() => {
    shouldAutoScrollRef.current = isNearBottom(messageListRef.current);
  }, []);

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
      && shouldAutoScrollForAgentLoopMessageUpdate(previousMessages, messages);
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
