/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import {
  DesktopConversationReplayRuntime,
} from '../../../app/runtime/desktopConversationReplayRuntime';

const {
  executeReplayAction,
} = DesktopConversationReplayRuntime;

export function useConversationReplayActions() {
  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      userMessageId,
      editedText,
    });
  }, []);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      assistantMessageId,
    });
  }, []);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
