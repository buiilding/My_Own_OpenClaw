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
  sdkLiveTurn = null,
  sessionConversationRef = null,
} = {}) {
  return (
    conversationView?.conversationRef
    || sdkLiveTurn?.conversationRef
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
  conversationView = null,
  conversationViewSurface = 'pill',
  pendingTurn = null,
  sdkLiveTurn = null,
  sessionConversationRef = null,
} = {}) {
  const hasConversationView = isObject(conversationView);
  const rendererFallbackMessages = hasConversationView
    ? []
    : Array.isArray(messages) ? messages : [];
  const effectiveSdkLiveTurn = hasConversationView ? null : sdkLiveTurn;
  const visibleTurnLifecycle = resolveVisibleTurnLifecycle({
    activeConversationRef: resolveSurfaceConversationRef({
      conversationView,
      sdkLiveTurn: effectiveSdkLiveTurn,
      sessionConversationRef,
    }),
    pendingTurn,
    sdkLiveTurn: effectiveSdkLiveTurn,
    conversationView,
    messages: rendererFallbackMessages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    sdkLiveTurn: effectiveSdkLiveTurn,
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

function buildChatSurfaceControllerStateFromSurfaceState({
  chatSurfaceState = null,
  conversationViewSurface = 'pill',
  sessionConversationRef = null,
} = {}) {
  const surfaceState = isObject(chatSurfaceState) ? chatSurfaceState : {};
  const conversationView = isObject(surfaceState.conversationView)
    ? surfaceState.conversationView
    : null;
  return buildChatSurfaceControllerState({
    messages: Array.isArray(surfaceState.messages) ? surfaceState.messages : [],
    conversationView,
    conversationViewSurface,
    pendingTurn: surfaceState.pendingTurn ?? null,
    sdkLiveTurn: surfaceState.sdkLiveTurn ?? null,
    sessionConversationRef,
  });
}

export const DesktopChatSurfaceRuntime = Object.freeze({
  buildChatSurfaceControllerState,
  buildChatSurfaceControllerStateFromSurfaceState,
});
