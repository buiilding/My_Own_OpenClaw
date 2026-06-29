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
  const handleEditFromUser = useCallback(async (targetRowId, editedText, conversationRef = null) => {
    return executeReplayAction({
      action: 'edit_resend',
      targetRowId,
      editedText,
      conversationRef,
    });
  }, []);

  const handleTryAgainFromAssistant = useCallback(async (targetRowId, conversationRef = null) => {
    return executeReplayAction({
      action: 'retry',
      targetRowId,
      conversationRef,
    });
  }, []);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
