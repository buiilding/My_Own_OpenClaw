/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';
import { desktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
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
import { DesktopPendingTurnRuntimeClient } from '../../../app/runtime/desktopPendingTurnRuntimeClient';

const chatSkin = desktopRuntimeSkin.chat;

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
  const { addMessage, setIsSending } = useChatCommonActions();
  const clearPendingTurn = useChatStore((state) => state.clearPendingTurn);
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
      text: chatSkin.sendFailureMessage,
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
      clearPendingTurn({
        conversationRef: preparedTurn.conversationRef,
        turnRef: preparedTurn.turnRef,
      });
      DesktopPendingTurnRuntimeClient.clear({
        conversationRef: preparedTurn.conversationRef,
        turnRef: preparedTurn.turnRef,
      });
      setIsSending(false, preparedTurn.conversationRef);
      appendSendFailureMessage(preparedTurn.conversationRef);
      throw error;
    }
  }, [
    appendSendFailureMessage,
    clearPendingTurn,
    setIsSending,
    stopPlayback,
    senderSurface,
    sendLifecycle,
    setChatActiveConversationRef,
    config,
  ]);

  return { sendMessage };
}
