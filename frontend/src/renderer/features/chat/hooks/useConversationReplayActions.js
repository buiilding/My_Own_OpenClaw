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
  messages,
}) {
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const addMessage = useChatStore((state) => state.addMessage);
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const deferredQueryModelSelection = DesktopRendererConfigRuntimeClient
    .buildDeferredQueryModelSelection(config);

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      activeConversationRef,
      deferredQueryModelSelection,
      conversationView,
      messages,
      userMessageId,
      editedText,
      failureMessages: {
        sendFailureMessage: chatSkin.sendFailureMessage,
        replayPreparationFailureMessage: chatSkin.replayPreparationFailureMessage,
      },
      chatStore: useChatStore,
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    conversationView,
    deferredQueryModelSelection,
    messages,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      activeConversationRef,
      deferredQueryModelSelection,
      conversationView,
      messages,
      assistantMessageId,
      failureMessages: {
        sendFailureMessage: chatSkin.sendFailureMessage,
        replayPreparationFailureMessage: chatSkin.replayPreparationFailureMessage,
      },
      chatStore: useChatStore,
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    conversationView,
    deferredQueryModelSelection,
    messages,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
