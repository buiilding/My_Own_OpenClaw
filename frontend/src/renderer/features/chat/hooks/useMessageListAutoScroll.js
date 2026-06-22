/**
 * Provides the use message list auto scroll module for the renderer UI.
 */

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { DesktopMessageListRuntime } from '../../../app/runtime/desktopMessageListRuntime';

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
  const scheduledScrollFrameRef = useRef(null);
  const scheduledScrollBehaviorRef = useRef(null);

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
    DesktopMessageListRuntime.scrollToBottom(messageListRef.current, behavior);
  }, []);

  const scheduleScrollToBottom = useCallback((behavior = 'smooth') => {
    DesktopMessageListRuntime.scheduleMessageListScrollToBottom({
      elementRef: messageListRef,
      frameRef: scheduledScrollFrameRef,
      behaviorRef: scheduledScrollBehaviorRef,
      behavior,
    });
  }, []);

  useEffect(() => {
    return () => {
      DesktopMessageListRuntime.clearScheduledMessageListScroll({
        frameRef: scheduledScrollFrameRef,
        behaviorRef: scheduledScrollBehaviorRef,
      });
    };
  }, []);

  useEffect(() => {
    if (conversationRef === undefined) {
      return;
    }
    shouldAutoScrollRef.current = true;
    skipNextMessagesAutoScrollRef.current = true;
    forceInstantAutoScrollRef.current = true;
    DesktopMessageListRuntime.scrollToConversationSwitchTarget(messageListRef.current, 'auto');
    syncScrollMetrics();
  }, [conversationRef, syncScrollMetrics]);

  const handleMessageListScroll = useCallback(() => {
    const element = messageListRef.current;
    const nextScrollTop = Number(element?.scrollTop) || 0;
    const nextScrollHeight = Number(element?.scrollHeight) || 0;
    const nearBottom = DesktopMessageListRuntime.isNearBottom(element);
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
    return DesktopMessageListRuntime.observeMessageListResize({
      elementRef: messageListRef,
      onResize: () => {
        const currentElement = messageListRef.current;
        if (!currentElement) {
          return;
        }

        const nextScrollHeight = Number(currentElement.scrollHeight) || 0;
        const scrollHeightChanged = nextScrollHeight !== lastScrollHeightRef.current;
        if (scrollHeightChanged && enableAgentLoopAutoScroll && shouldAutoScrollRef.current) {
          scheduleScrollToBottom(forceInstantAutoScrollRef.current ? 'auto' : 'smooth');
          forceInstantAutoScrollRef.current = false;
        }

        lastScrollTopRef.current = Number(currentElement.scrollTop) || 0;
        lastScrollHeightRef.current = nextScrollHeight;
      },
    });
  }, [enableAgentLoopAutoScroll, scheduleScrollToBottom]);

  useEffect(() => {
    const previousMessages = previousMessagesRef.current;
    const shouldForceScroll = DesktopMessageListRuntime.shouldForceScrollForNewUserMessage(
      previousMessages,
      messages,
    );

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
        DesktopMessageListRuntime.shouldAutoScrollForAgentLoopMessageUpdate(
          previousMessages,
          messages,
        )
        || DesktopMessageListRuntime.shouldAutoScrollForThinkingTextUpdate(
          previousMessages,
          messages,
        )
      );
    previousMessagesRef.current = messages;
    if (!shouldAutoScroll) {
      return;
    }

    const behavior = forceInstantAutoScrollRef.current ? 'auto' : 'smooth';
    forceInstantAutoScrollRef.current = false;
    scheduleScrollToBottom(behavior);
  }, [enableAgentLoopAutoScroll, messages, scheduleScrollToBottom, scrollToBottom]);

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

    scheduleScrollToBottom('smooth');
  }, [awaitingDotTargetMessageId, enableAgentLoopAutoScroll, scheduleScrollToBottom]);

  return {
    messageListRef,
    handleMessageListScroll,
  };
}
