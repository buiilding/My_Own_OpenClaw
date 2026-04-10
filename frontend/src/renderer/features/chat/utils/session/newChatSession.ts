import type { TokenCounts } from '../../stores/chatStore';
import { updateTranscriptSession } from '../../../../infrastructure/transcript/TranscriptWriter';
import { markConversationInferenceSessionLocalOnly } from '../../session/conversationInferenceSessionRuntime';
import { applyRendererConversationSelection } from '../../session/conversationSessionRuntime';
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

  const nextConversationRef = createConversationRef();
  applyRendererConversationSelection({
    conversationRef: nextConversationRef,
    updateTranscriptSession,
  });
  setConversationWorkspaceBinding(nextConversationRef, workspaceSelectionToBinding(workspace));
  markConversationInferenceSessionLocalOnly(nextConversationRef);
  return nextConversationRef;
};
