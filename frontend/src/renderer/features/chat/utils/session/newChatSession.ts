import type { TokenCounts } from '../../stores/chatStore';
import { markConversationInferenceSessionLocalOnly } from '../../session/conversationInferenceSessionRuntime';
import { DesktopTranscriptSessionRuntimeClient } from '../../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  applyRendererConversationSelection,
  initializeLocalConversationSession,
} from '../../session/conversationSessionRuntime';
import {
  setConversationWorkspaceBinding,
  workspaceSelectionToBinding,
} from '../../../../infrastructure/workspace/conversationWorkspaceBinding';
import { createConversationRef } from './conversationRef';
import { resetActiveChatSession } from './resetActiveChatSession';

type NewChatSessionOptions = {
  clearMessages: (conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setTokenCounts: (counts: TokenCounts | null, conversationRef?: string | null) => void;
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
  workspace,
}: NewChatSessionOptions): string => {
  resetActiveChatSession({
    clearMessages,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  });

  return initializeLocalConversationSession({
    createConversationRef,
    selectConversationRef: (conversationRef) => {
      applyRendererConversationSelection({
        conversationRef,
        updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
      });
    },
    onConversationCreated: (conversationRef) => {
      setConversationWorkspaceBinding(conversationRef, workspaceSelectionToBinding(workspace));
    },
    markConversationInferenceSessionLocalOnly,
  });
};
