/**
 * Projects chat surface state from SDK view and renderer pending bridge inputs.
 */

import {
  DesktopCurrentTurnPresentationRuntime,
} from './desktopCurrentTurnPresentationRuntime';
import {
  DesktopLiveTurnSurfaceRuntime,
} from './desktopLiveTurnSurfaceRuntime';
import {
  DesktopVisibleTurnLifecycleRuntime,
} from './desktopVisibleTurnLifecycleRuntime';

const {
  resolveCurrentTurnPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;
const {
  applyVisibleTurnLifecycleToPresentationState,
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveSurfaceConversationRef({
  conversationView = null,
  currentTurnProjection = null,
  sessionConversationRef = null,
} = {}) {
  return (
    conversationView?.conversationRef
    || currentTurnProjection?.conversationRef
    || sessionConversationRef
    || null
  );
}

function resolveConversationViewSurfaceMode(conversationView, surfaceName) {
  if (!isObject(conversationView) || typeof surfaceName !== 'string' || !surfaceName) {
    return null;
  }
  return conversationView?.surfaces?.[surfaceName]?.mode ?? null;
}

function buildChatSurfaceControllerState({
  messages = [],
  currentTurnProjection = null,
  conversationView = null,
  conversationViewSurface = 'pill',
  pendingTurn = null,
  sessionConversationRef = null,
} = {}) {
  const hasConversationView = isObject(conversationView);
  const rendererFallbackMessages = hasConversationView ? [] : messages;
  const effectiveCurrentTurnProjection = hasConversationView ? null : currentTurnProjection;
  const visibleTurnLifecycle = resolveVisibleTurnLifecycle({
    activeConversationRef: resolveSurfaceConversationRef({
      conversationView,
      currentTurnProjection: effectiveCurrentTurnProjection,
      sessionConversationRef,
    }),
    pendingTurn,
    currentTurnProjection: effectiveCurrentTurnProjection,
    conversationView,
    messages: rendererFallbackMessages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection: effectiveCurrentTurnProjection,
    conversationView,
    pendingTurn,
    messages: rendererFallbackMessages,
    visibleTurnLifecycle,
  });
  const currentTurnPresentationState = resolveCurrentTurnPresentationState({
    messages: rendererFallbackMessages,
  });
  const currentTurnPresentationStateWithLifecycle = applyVisibleTurnLifecycleToPresentationState(
    currentTurnPresentationState,
    visibleTurnLifecycle,
  );
  const viewSurfaceMode = resolveConversationViewSurfaceMode(
    conversationView,
    conversationViewSurface,
  );
  const isLocalPending = liveTurnPresentationInput.useLocalPendingTurn === true;
  const isBusy = isLocalPending
    ? true
    : hasConversationView
      ? viewSurfaceMode === 'busy'
      : visibleTurnLifecycle.isBusy === true;
  const canStop = isLocalPending
    ? true
    : hasConversationView
      ? conversationView?.liveTurn?.canStop === true
      : false;

  return {
    currentTurnPresentationState: currentTurnPresentationStateWithLifecycle,
    isBusy,
    canStop,
    liveTurnPhase: liveTurnPresentationInput.phase,
    liveTurnPresentationInput,
    liveTurnSource: liveTurnPresentationInput.source,
    visibleTurnLifecycle,
  };
}

export const DesktopChatSurfaceRuntime = Object.freeze({
  buildChatSurfaceControllerState,
});
