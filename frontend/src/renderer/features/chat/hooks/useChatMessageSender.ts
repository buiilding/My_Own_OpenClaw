/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import {
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from '../policies/messageSendUiPolicy';
import { useChatCommonActions } from './useChatCommonActions';
import {
  type OutgoingUserMessagePayload,
} from '../utils/messageSender/chatMessageSenderPayloads';
import { resolveChatPillSendLifecycle } from '../utils/chatPill/chatPillSessionFlow';
import {
  dispatchPreparedDesktopChatTurn,
  prepareDesktopChatSend,
} from '../utils/messageSender/desktopChatSendPreparation';

type ChatMessageSenderOptions = {
  senderSurface?: ChatSendSurface;
  returnToChatboxPolicy?: ReturnToChatboxPolicy;
};

/**
 * Custom hook for sending chat messages.
 * Handles screenshot capture and message sending.
 */
export function useChatMessageSender(
  stopPlayback?: () => void,
  options: ChatMessageSenderOptions = {},
) {
  const { addMessage, updateMessage, setIsSending, setThinkingStatus } = useChatCommonActions();
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const { config } = useAppConfigContext();
  const { senderSurface = 'overlay-chatbox', returnToChatboxPolicy } = options;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;
  const sendLifecycle = useMemo(() => resolveChatPillSendLifecycle({
    senderSurface,
    returnToChatboxPolicy,
    includeQueryScreenshot,
  }), [includeQueryScreenshot, returnToChatboxPolicy, senderSurface]);

  const appendSendFailureMessage = useCallback((conversationRef?: string | null) => {
    addMessage({
      id: crypto.randomUUID(),
      text: "Your message wasn't sent because WindieOS isn't connected right now. Try again when the backend reconnects.",
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    }, conversationRef);
  }, [addMessage]);

  const sendMessage = useCallback(async (payload: OutgoingUserMessagePayload) => {
    const preparedTurn = await prepareDesktopChatSend({
      payload,
      config,
      dependencies: {
        addMessage,
        updateMessage,
        setIsSending,
        setThinkingStatus,
        setChatActiveConversationRef,
        stopPlayback,
      },
      senderSurface,
      sendLifecycle,
    });

    if (!preparedTurn) {
      return;
    }

    try {
      await dispatchPreparedDesktopChatTurn(preparedTurn);
    } catch (error) {
      console.error('[useChatMessageSender] Failed to send query:', error);
      setIsSending(false, preparedTurn.conversationRef);
      appendSendFailureMessage(preparedTurn.conversationRef);
      throw error;
    }
  }, [
    addMessage,
    appendSendFailureMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    stopPlayback,
    senderSurface,
    sendLifecycle,
    setChatActiveConversationRef,
    config,
  ]);

  return { sendMessage };
}
