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
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import {
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from '../../../app/runtime/desktopMessageSendUiRuntime';
import {
  type OutgoingUserMessagePayload,
} from '../../../app/runtime/desktopChatSendPayloadRuntime';
import { DesktopChatPillSessionRuntime } from '../../../app/runtime/desktopChatPillSessionRuntime';
import { DesktopChatSendPreparationRuntime } from '../../../app/runtime/desktopChatSendPreparationRuntime';

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
  const setChatActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const { senderSurface = 'overlay-chatbox', returnToChatboxPolicy } = options;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;
  const sendLifecycle = useMemo(() => resolveChatPillSendLifecycle({
    senderSurface,
    returnToChatboxPolicy,
    includeQueryScreenshot,
  }), [includeQueryScreenshot, returnToChatboxPolicy, senderSurface]);

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
      await dispatchPreparedDesktopChatTurn(preparedTurn, {
        clearPendingTurn: clearPendingTurnInChatStore,
      });
    } catch (error) {
      console.error('[useChatMessageSender] Failed to send query:', error);
      throw error;
    }
  }, [
    stopPlayback,
    senderSurface,
    sendLifecycle,
    setChatActiveConversationRef,
    config,
  ]);

  return { sendMessage };
}
