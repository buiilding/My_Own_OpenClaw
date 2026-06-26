/**
 * useChatMessageSender Hook.
 * Handles sending user messages with screenshot capture and window management.
 */

import { useCallback, useMemo } from 'react';
import {
  selectChatSendReadModel,
  useChatStore,
} from '../stores/chatStore';
import {
  acceptPendingTurnInChatStore,
  clearPendingTurnInChatStore,
} from '../stores/chatStoreAdapters';
import { DesktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import {
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from '../../../app/runtime/desktopMessageSendUiRuntime';
import { useChatCommonActions } from './useChatCommonActions';
import {
  type OutgoingUserMessagePayload,
} from '../../../app/runtime/desktopChatSendPayloadRuntime';
import { DesktopChatPillSessionRuntime } from '../../../app/runtime/desktopChatPillSessionRuntime';
import { DesktopChatSendPreparationRuntime } from '../../../app/runtime/desktopChatSendPreparationRuntime';
import { DesktopPendingTurnRuntimeClient } from '../../../app/runtime/desktopPendingTurnRuntimeClient';

const chatSkin = DesktopRuntimeSkin.desktopRuntimeSkin.chat;
const {
  resolveChatPillSendLifecycle,
} = DesktopChatPillSessionRuntime;
const {
  dispatchPreparedDesktopChatTurn,
  prepareDesktopChatSend,
} = DesktopChatSendPreparationRuntime;

function getChatSendReadModel() {
  return selectChatSendReadModel(useChatStore.getState());
}

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
  const { addMessage } = useChatCommonActions();
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
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
        acceptPendingTurn: acceptPendingTurnInChatStore,
        getActiveConversationRef: () => useChatStore.getState().activeConversationRef,
        getSendReadModel: getChatSendReadModel,
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
      clearPendingTurnInChatStore({
        conversationRef: preparedTurn.conversationRef,
        turnRef: preparedTurn.turnRef,
      });
      DesktopPendingTurnRuntimeClient.clear({
        conversationRef: preparedTurn.conversationRef,
        turnRef: preparedTurn.turnRef,
      });
      appendSendFailureMessage(preparedTurn.conversationRef);
      throw error;
    }
  }, [
    appendSendFailureMessage,
    stopPlayback,
    senderSurface,
    sendLifecycle,
    setChatActiveConversationRef,
    config,
  ]);

  return { sendMessage };
}
