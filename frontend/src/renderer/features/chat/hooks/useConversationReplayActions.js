/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import {
  executeReplayActionFromChatStore,
} from '../stores/chatStoreAdapters';
import {
  DesktopRendererConfigRuntimeClient,
} from '../../../app/runtime/desktopRendererConfigRuntimeClient';

export function useConversationReplayActions() {
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayActionFromChatStore({
      action: 'edit_resend',
      config,
      userMessageId,
      editedText,
    });
  }, [
    config,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayActionFromChatStore({
      action: 'retry',
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
