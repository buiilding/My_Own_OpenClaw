/**
 * Provides the chat turn presentation state module for the renderer UI.
 */

import {
  isChatLoopAwaitingReply,
  isChatLoopBusy,
  resolveChatLoopUiState,
} from './desktopChatLoopUiRuntime';
import {
  getActiveOverlayTurnLifecycle,
  getAwaitingOverlayTurnLifecycle,
  getIdleOverlayTurnLifecycle,
  getTerminalOverlayTurnLifecycle,
} from './desktopOverlayTurnLifecycleRuntime';
import { resolveSdkOverlayIntent } from './desktopLiveTurnSurfaceRuntime';

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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function resolveSdkAwaitingDotTargetMessageId(presentation, fallbackState) {
  if (!presentation || !hasOwn(presentation, 'awaitingAnchor')) {
    return fallbackState?.awaitingDotTargetMessageId ?? null;
  }
  const anchor = presentation.awaitingAnchor;
  if (
    anchor
    && anchor.kind === 'user-message'
    && typeof anchor.rowId === 'string'
    && anchor.rowId.trim()
  ) {
    return anchor.rowId;
  }
  return null;
}

function resolveSdkOverlayLifecycle(presentation, overlayIntent) {
  if (!presentation) {
    return getIdleOverlayTurnLifecycle();
  }
  if (overlayIntent?.mode === 'awaiting') {
    return getAwaitingOverlayTurnLifecycle();
  }
  if (overlayIntent?.mode === 'response' && presentation.isBusy) {
    return getActiveOverlayTurnLifecycle();
  }
  if (presentation.isTerminal) {
    return getTerminalOverlayTurnLifecycle();
  }
  return getIdleOverlayTurnLifecycle();
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
  lifecycle = getIdleOverlayTurnLifecycle(),
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

export function resolveSdkCurrentTurnPresentationState({
  currentTurnProjection = null,
  fallbackState = null,
  responseOverlayEntries = [],
  dismissedResponseId = null,
  includeOverlayIntent = false,
} = {}) {
  const presentation = currentTurnProjection?.presentation;
  if (!presentation) {
    return null;
  }
  const latestEntry = responseOverlayEntries.length > 0
    ? responseOverlayEntries[responseOverlayEntries.length - 1]
    : null;
  const visibleResponse = (
    latestEntry && latestEntry.id !== dismissedResponseId
      ? latestEntry
      : null
  );
  const overlayIntent = resolveSdkOverlayIntent(presentation, currentTurnProjection);
  const awaitingVisible = overlayIntent.mode === 'awaiting';
  const responseVisible = overlayIntent.mode === 'response';
  const overlayTurnLifecycle = resolveSdkOverlayLifecycle(presentation, overlayIntent);
  const state = {
    activeResponse: visibleResponse,
    hasVisibleReply: presentation.hasVisibleContent === true,
    loopUiState: responseVisible ? 'active-response' : (awaitingVisible ? 'awaiting-reply' : 'idle'),
    isBusy: presentation.isBusy === true,
    isAwaitingReply: awaitingVisible,
    showAssistantAwaitingDot: awaitingVisible,
    awaitingDotTargetMessageId: awaitingVisible
      ? resolveSdkAwaitingDotTargetMessageId(presentation, fallbackState)
      : null,
    visibleResponse,
    chatboxSurfaceState: responseVisible ? 'response' : (awaitingVisible ? 'awaiting-reply' : 'compact'),
    showChatboxAwaitingReply: awaitingVisible,
    showChatboxResponse: responseVisible,
    isTransportConnected: true,
    overlayTurnLifecycle,
  };
  if (includeOverlayIntent) {
    state.overlayIntent = overlayIntent;
  }
  return state;
}
