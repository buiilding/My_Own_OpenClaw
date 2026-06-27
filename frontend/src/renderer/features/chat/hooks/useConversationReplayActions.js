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
  useChatStore,
} from '../stores/chatStore';

const {
  executeReplayAction,
} = DesktopConversationReplayRuntime;

export function useConversationReplayActions() {
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    return executeReplayAction({
      action: 'edit_resend',
      chatStore: useChatStore,
      config,
      userMessageId,
      editedText,
    });
  }, [
    config,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    return executeReplayAction({
      action: 'retry',
      chatStore: useChatStore,
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
