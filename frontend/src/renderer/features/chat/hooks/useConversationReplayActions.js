/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import {
  DesktopConversationReplayRuntime,
} from '../../../app/runtime/desktopConversationReplayRuntime';
import {
  getActiveConversationRefFromChatStore,
} from '../stores/chatStoreAdapters';

const {
  executeReplayAction,
} = DesktopConversationReplayRuntime;

const replayUiContext = {
  getActiveConversationRef: getActiveConversationRefFromChatStore,
};

export function useConversationReplayActions() {
  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      replayUiContext,
      userMessageId,
      editedText,
    });
  }, []);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      replayUiContext,
      assistantMessageId,
    });
  }, []);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
