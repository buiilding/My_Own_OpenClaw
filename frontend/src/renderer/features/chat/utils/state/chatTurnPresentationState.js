import { isChatLoopAwaitingReply } from './chatLoopUiState';

export const CHATBOX_SURFACE_STATE = Object.freeze({
  COMPACT: 'compact',
  AWAITING_REPLY: 'awaiting-reply',
  RESPONSE: 'response',
});

export const VISIBLE_ASSISTANT_REPLY_TYPES = Object.freeze(['llm-text', 'error']);
export const VISIBLE_ASSISTANT_REPLY_TYPE_SET = new Set(VISIBLE_ASSISTANT_REPLY_TYPES);
const DEFAULT_VISIBLE_ASSISTANT_REPLY_TYPES = VISIBLE_ASSISTANT_REPLY_TYPE_SET;

export function findLastUserIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender === 'user') {
      return index;
    }
  }
  return -1;
}

export function findLatestVisibleAssistantReply(
  messages,
  allowedTypes = DEFAULT_VISIBLE_ASSISTANT_REPLY_TYPES,
) {
  const lastUserIndex = findLastUserIndex(messages);
  const lowerBound = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;
  for (let index = messages.length - 1; index >= lowerBound; index -= 1) {
    const message = messages[index];
    if (message?.sender !== 'assistant') {
      continue;
    }
    if (!message?.text) {
      continue;
    }
    if (!allowedTypes.has(message.type)) {
      continue;
    }
    return message;
  }
  return null;
}

export function hasVisibleChatTurnReply(activeResponse) {
  return Boolean(activeResponse);
}

export function hasVisibleChatboxResponse(activeResponse, dismissedResponseId) {
  return Boolean(activeResponse && activeResponse.id !== dismissedResponseId);
}

export function resolveChatboxSurfaceState({
  loopUiState,
  activeResponse,
  dismissedResponseId = null,
}) {
  const hasVisibleResponse = hasVisibleChatboxResponse(activeResponse, dismissedResponseId);
  if (hasVisibleResponse && !isChatLoopAwaitingReply(loopUiState)) {
    return CHATBOX_SURFACE_STATE.RESPONSE;
  }
  if (isChatLoopAwaitingReply(loopUiState)) {
    return CHATBOX_SURFACE_STATE.AWAITING_REPLY;
  }
  return CHATBOX_SURFACE_STATE.COMPACT;
}

export function shouldShowChatboxAwaitingReply(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.AWAITING_REPLY;
}

export function shouldShowChatboxResponse(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.RESPONSE;
}

export function resolveChatTurnPresentationState({
  messages,
  loopUiState,
  dismissedResponseId = null,
  allowedTypes = DEFAULT_VISIBLE_ASSISTANT_REPLY_TYPES,
  activeResponse: providedActiveResponse,
}) {
  const activeResponse = providedActiveResponse
    ?? findLatestVisibleAssistantReply(messages, allowedTypes);
  const hasVisibleReply = hasVisibleChatTurnReply(activeResponse);
  const chatboxSurfaceState = resolveChatboxSurfaceState({
    loopUiState,
    activeResponse,
    dismissedResponseId,
  });

  return {
    activeResponse,
    hasVisibleReply,
    showAssistantAwaitingDot: (
      isChatLoopAwaitingReply(loopUiState)
      && messages.length > 0
      && !hasVisibleReply
    ),
    visibleResponse: hasVisibleChatboxResponse(activeResponse, dismissedResponseId)
      ? activeResponse
      : null,
    chatboxSurfaceState,
    showChatboxAwaitingReply: shouldShowChatboxAwaitingReply(chatboxSurfaceState),
    showChatboxResponse: shouldShowChatboxResponse(chatboxSurfaceState),
  };
}
