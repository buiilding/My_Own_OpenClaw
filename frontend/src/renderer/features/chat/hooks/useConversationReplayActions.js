/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import {
  DesktopRendererConfigRuntimeClient,
} from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import {
  DesktopConversationReplayRuntime,
} from '../../../app/runtime/desktopConversationReplayRuntime';
import { DesktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';

const {
  executeReplayAction,
} = DesktopConversationReplayRuntime;
const chatSkin = DesktopRuntimeSkin.desktopRuntimeSkin.chat;

export function useConversationReplayActions({
  conversationView = null,
  replayFallbackMessages = [],
}) {
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const deferredQueryModelSelection = DesktopRendererConfigRuntimeClient
    .buildDeferredQueryModelSelection(config);

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      deferredQueryModelSelection,
      conversationView,
      messages: replayFallbackMessages,
      userMessageId,
      editedText,
      failureMessages: {
        sendFailureMessage: chatSkin.sendFailureMessage,
        replayPreparationFailureMessage: chatSkin.replayPreparationFailureMessage,
      },
      chatStore: useChatStore,
    });
  }, [
    conversationView,
    deferredQueryModelSelection,
    replayFallbackMessages,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      deferredQueryModelSelection,
      conversationView,
      messages: replayFallbackMessages,
      assistantMessageId,
      failureMessages: {
        sendFailureMessage: chatSkin.sendFailureMessage,
        replayPreparationFailureMessage: chatSkin.replayPreparationFailureMessage,
      },
      chatStore: useChatStore,
    });
  }, [
    conversationView,
    deferredQueryModelSelection,
    replayFallbackMessages,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
