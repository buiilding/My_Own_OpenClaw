/**
 * Orchestrates renderer new-chat session reset and local conversation creation.
 */

import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';
import {
  applyRendererConversationSelection,
  createConversationRef,
  initializeLocalConversationSession,
} from './desktopConversationSessionRuntime';
import { DesktopActiveChatSessionRuntime } from './desktopActiveChatSessionRuntime';
import type { TokenCounts } from './desktopChatMessageTypes';

const {
  resetActiveChatSession,
} = DesktopActiveChatSessionRuntime;

type NewChatSessionOptions = {
  clearMessages: (conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
  setChatActiveConversationRef: (conversationRef: string | null) => void;
  workspace?: {
    activeWorkspaceName?: string | null;
    activeWorkspacePath?: string | null;
  } | null;
};

export const startNewChatSession = ({
  clearMessages,
  setIsSending,
  setThinkingStatus,
  setTokenCounts,
  setChatActiveConversationRef,
  workspace,
}: NewChatSessionOptions): string => {
  resetActiveChatSession({
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  });
  setChatActiveConversationRef(null);

  return initializeLocalConversationSession({
    createConversationRef,
    selectConversationRef: (conversationRef) => {
      applyRendererConversationSelection({
        conversationRef,
        updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
        setChatConversationRef: setChatActiveConversationRef,
      });
    },
    onConversationCreated: (conversationRef) => {
      DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding(
        conversationRef,
        DesktopWorkspaceRuntimeClient.workspaceSelectionToBinding(workspace),
      );
    },
  });
};
