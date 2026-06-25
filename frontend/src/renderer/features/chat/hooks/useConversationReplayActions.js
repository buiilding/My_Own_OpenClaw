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
const EMPTY_REPLAY_MESSAGES = Object.freeze([]);

export function useConversationReplayActions({
  replayReadModel = null,
} = {}) {
  const conversationView = replayReadModel?.conversationView ?? null;
  const replayMessages = replayReadModel?.messages;
  const messages = Array.isArray(replayMessages)
    ? replayMessages
    : EMPTY_REPLAY_MESSAGES;
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const deferredQueryModelSelection = DesktopRendererConfigRuntimeClient
    .buildDeferredQueryModelSelection(config);

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
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
    });
  }, [
    deferredQueryModelSelection,
    conversationView,
    messages,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      deferredQueryModelSelection,
      conversationView,
      messages,
      assistantMessageId,
      failureMessages: {
        sendFailureMessage: chatSkin.sendFailureMessage,
        replayPreparationFailureMessage: chatSkin.replayPreparationFailureMessage,
      },
      chatStore: useChatStore,
    });
  }, [
    deferredQueryModelSelection,
    conversationView,
    messages,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
