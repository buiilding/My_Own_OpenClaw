/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import {
  editUserMessageReplayFromChatStore,
  retryAssistantMessageReplayFromChatStore,
} from '../stores/chatStoreAdapters';
import {
  DesktopRendererConfigRuntimeClient,
} from '../../../app/runtime/desktopRendererConfigRuntimeClient';

export function useConversationReplayActions() {
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return editUserMessageReplayFromChatStore({
      config,
      userMessageId,
      editedText,
    });
  }, [
    config,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return retryAssistantMessageReplayFromChatStore({
      config,
      assistantMessageId,
    });
  }, [
    config,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
