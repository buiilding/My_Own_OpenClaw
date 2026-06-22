/**
 * Provides the chat turn presentation state module for the renderer UI.
 */

import { DesktopLiveTurnSurfaceRuntime } from './desktopLiveTurnSurfaceRuntime';

const {
  resolveSdkOverlayIntent,
} = DesktopLiveTurnSurfaceRuntime;

const CHATBOX_SURFACE_STATE = Object.freeze({
  COMPACT: 'compact',
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

function findLatestVisibleAssistantReply(
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

function hasVisibleChatboxResponse(activeResponse, dismissedResponseId) {
  return Boolean(activeResponse && activeResponse.id !== dismissedResponseId);
}

function resolveCurrentTurnPresentationState({
  messages,
  dismissedResponseId = null,
  allowedTypes = DEFAULT_VISIBLE_ASSISTANT_REPLY_TYPES,
  activeResponse: providedActiveResponse,
}) {
  const activeResponse = providedActiveResponse
    ?? findLatestVisibleAssistantReply(messages, allowedTypes);
  const hasVisibleReply = Boolean(activeResponse);
  const visibleResponse = hasVisibleChatboxResponse(activeResponse, dismissedResponseId)
    ? activeResponse
    : null;
  const chatboxSurfaceState = visibleResponse
    ? CHATBOX_SURFACE_STATE.RESPONSE
    : CHATBOX_SURFACE_STATE.COMPACT;

  return {
    activeResponse,
    hasVisibleReply,
    isBusy: false,
    awaitingDotTargetMessageId: null,
    visibleResponse,
    chatboxSurfaceState,
  };
}

function resolveSdkResponseOverlayPresentationState({
  currentTurnProjection = null,
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
  const responseVisible = Boolean(visibleResponse);
  const state = {
    activeResponse: visibleResponse,
    hasVisibleReply: Boolean(visibleResponse),
    visibleResponse,
    chatboxSurfaceState: responseVisible
      ? CHATBOX_SURFACE_STATE.RESPONSE
      : CHATBOX_SURFACE_STATE.COMPACT,
  };
  if (includeOverlayIntent) {
    state.overlayIntent = overlayIntent;
  }
  return state;
}

function resolveResponseOverlayDismissalTarget({
  currentTurnProjection = null,
  responseOverlayEntries = [],
  useSdkLiveTurnPresentation = false,
} = {}) {
  if (!Array.isArray(responseOverlayEntries) || responseOverlayEntries.length === 0) {
    return null;
  }
  const latestEntry = responseOverlayEntries[responseOverlayEntries.length - 1];
  if (!latestEntry?.id) {
    return null;
  }
  const sdkOverlayIntent = useSdkLiveTurnPresentation
    ? resolveSdkOverlayIntent(currentTurnProjection?.presentation, currentTurnProjection)
    : null;
  const turnRef = (
    sdkOverlayIntent?.turnRef
    || latestEntry.turnRef
    || currentTurnProjection?.turnRef
    || null
  );
  const conversationRef = (
    sdkOverlayIntent?.conversationRef
    || currentTurnProjection?.conversationRef
    || null
  );
  const guardRef = (
    sdkOverlayIntent?.staleGuardRef
    || sdkOverlayIntent?.turnRef
    || turnRef
    || null
  );
  return {
    conversationRef,
    turnRef,
    guardRef,
    responseEntryId: latestEntry.id,
  };
}

export const DesktopCurrentTurnPresentationRuntime = Object.freeze({
  findLatestVisibleAssistantReply,
  resolveCurrentTurnPresentationState,
  resolveSdkResponseOverlayPresentationState,
  resolveResponseOverlayDismissalTarget,
});
