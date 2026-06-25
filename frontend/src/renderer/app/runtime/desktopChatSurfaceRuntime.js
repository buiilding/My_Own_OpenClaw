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
  const visibleTurnLifecycle = resolveVisibleTurnLifecycle({
    activeConversationRef: resolveSurfaceConversationRef({
      conversationView,
      currentTurnProjection,
      sessionConversationRef,
    }),
    pendingTurn,
    currentTurnProjection,
    conversationView,
    messages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    conversationView,
    pendingTurn,
    messages,
    visibleTurnLifecycle,
  });
  const currentTurnPresentationState = resolveCurrentTurnPresentationState({ messages });
  const currentTurnPresentationStateWithLifecycle = applyVisibleTurnLifecycleToPresentationState(
    currentTurnPresentationState,
    visibleTurnLifecycle,
  );
  const hasConversationView = isObject(conversationView);
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
