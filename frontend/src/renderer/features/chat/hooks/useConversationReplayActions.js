/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import {
  DesktopConversationReplayRuntime,
} from '../../../app/runtime/desktopConversationReplayRuntime';
import {
  DesktopRendererConfigRuntimeClient,
} from '../../../app/runtime/desktopRendererConfigRuntimeClient';
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
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      config,
      replayUiContext,
      userMessageId,
      editedText,
    });
  }, [
    config,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      config,
      replayUiContext,
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
