/**
 * Provides the chat turn presentation state module for the renderer UI.
 */

import {
  isChatLoopAwaitingReply,
  isChatLoopBusy,
  resolveChatLoopUiState,
} from './desktopChatLoopUiRuntime';
import { OVERLAY_TURN_LIFECYCLE } from './desktopOverlayTurnLifecycleRuntime';

const CHATBOX_SURFACE_STATE = Object.freeze({
  COMPACT: 'compact',
  AWAITING_REPLY: 'awaiting-reply',
  RESPONSE: 'response',
});

const VISIBLE_ASSISTANT_REPLY_TYPES = Object.freeze(['llm-text', 'error']);
const VISIBLE_ASSISTANT_REPLY_TYPE_SET = new Set(VISIBLE_ASSISTANT_REPLY_TYPES);
const DEFAULT_VISIBLE_ASSISTANT_REPLY_TYPES = VISIBLE_ASSISTANT_REPLY_TYPE_SET;

function findLastUserIndex(messages) {
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

function hasVisibleChatTurnReply(activeResponse) {
  return Boolean(activeResponse);
}

function hasCurrentTurnAssistantThinking(messages) {
  const lastUserIndex = findLastUserIndex(messages);
  const lowerBound = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;
  for (let index = lowerBound; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.sender !== 'assistant') {
      continue;
    }
    if (typeof message.thinkingText === 'string' && message.thinkingText.trim()) {
      return true;
    }
  }
  return false;
}

function findAwaitingDotTargetMessageId(messages, showAssistantAwaitingDot) {
  if (!showAssistantAwaitingDot) {
    return null;
  }
  const lastUserIndex = findLastUserIndex(messages);
  if (lastUserIndex === -1) {
    return null;
  }
  const message = messages[lastUserIndex];
  return typeof message?.id === 'string' && message.id ? message.id : null;
}

function hasVisibleChatboxResponse(activeResponse, dismissedResponseId) {
  return Boolean(activeResponse && activeResponse.id !== dismissedResponseId);
}

function resolveChatboxSurfaceState({
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

function shouldShowChatboxAwaitingReply(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.AWAITING_REPLY;
}

function shouldShowChatboxResponse(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.RESPONSE;
}

export function resolveCurrentTurnPresentationState({
  phase = null,
  lifecycle = OVERLAY_TURN_LIFECYCLE.IDLE,
  messages,
  dismissedResponseId = null,
  allowedTypes = DEFAULT_VISIBLE_ASSISTANT_REPLY_TYPES,
  activeResponse: providedActiveResponse,
}) {
  const activeResponse = providedActiveResponse
    ?? findLatestVisibleAssistantReply(messages, allowedTypes);
  const hasVisibleReply = hasVisibleChatTurnReply(activeResponse);
  const loopUiState = resolveChatLoopUiState({
    lifecycle,
    phase,
    hasVisibleReply,
  });
  const showAssistantAwaitingDot = (
    isChatLoopAwaitingReply(loopUiState)
    && messages.length > 0
    && !hasVisibleReply
    && !hasCurrentTurnAssistantThinking(messages)
  );
  const chatboxSurfaceState = resolveChatboxSurfaceState({
    loopUiState,
    activeResponse,
    dismissedResponseId,
  });

  return {
    activeResponse,
    hasVisibleReply,
    loopUiState,
    isBusy: isChatLoopBusy(loopUiState),
    isAwaitingReply: isChatLoopAwaitingReply(loopUiState),
    showAssistantAwaitingDot,
    awaitingDotTargetMessageId: findAwaitingDotTargetMessageId(messages, showAssistantAwaitingDot),
    visibleResponse: hasVisibleChatboxResponse(activeResponse, dismissedResponseId)
      ? activeResponse
      : null,
    chatboxSurfaceState,
    showChatboxAwaitingReply: shouldShowChatboxAwaitingReply(chatboxSurfaceState),
    showChatboxResponse: shouldShowChatboxResponse(chatboxSurfaceState),
  };
}
