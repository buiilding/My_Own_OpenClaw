import { useMemo } from 'react';
import { useChatLoopUiState } from './useChatLoopUiState';
import {
  findLatestVisibleAssistantReply,
  hasVisibleChatTurnReply,
  resolveChatTurnPresentationState,
} from '../utils/state/chatTurnPresentationState';

export function useCurrentTurnPresentationState({
  phase,
  isSending,
  messages,
  dismissedResponseId = null,
  allowedTypes,
}) {
  const activeResponse = useMemo(
    () => findLatestVisibleAssistantReply(messages, allowedTypes),
    [allowedTypes, messages],
  );
  const hasVisibleReply = hasVisibleChatTurnReply(activeResponse);
  const loopState = useChatLoopUiState({
    phase,
    isSending,
    hasVisibleReply,
  });

  const presentationState = useMemo(() => resolveChatTurnPresentationState({
    messages,
    loopUiState: loopState.loopUiState,
    dismissedResponseId,
    allowedTypes,
    activeResponse,
  }), [
    activeResponse,
    allowedTypes,
    dismissedResponseId,
    loopState.loopUiState,
    messages,
  ]);

  return {
    ...loopState,
    ...presentationState,
  };
}
