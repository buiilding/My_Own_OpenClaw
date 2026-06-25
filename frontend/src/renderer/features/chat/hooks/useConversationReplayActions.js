/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback, useMemo } from 'react';
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
  const replayFallbackMessages = useMemo(
    () => (conversationView ? [] : messages),
    [conversationView, messages],
  );

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      activeConversationRef,
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
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    conversationView,
    deferredQueryModelSelection,
    replayFallbackMessages,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      activeConversationRef,
      deferredQueryModelSelection,
      conversationView,
      messages: replayFallbackMessages,
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
    replayFallbackMessages,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
