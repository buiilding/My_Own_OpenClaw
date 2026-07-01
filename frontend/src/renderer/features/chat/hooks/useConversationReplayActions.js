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
  const handleEditFromUser = useCallback(async (targetRowId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      targetRowId,
      editedText,
    });
  }, []);

  const handleTryAgainFromAssistant = useCallback(async (targetRowId) => {
    return executeReplayAction({
      action: 'retry',
      targetRowId,
    });
  }, []);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
