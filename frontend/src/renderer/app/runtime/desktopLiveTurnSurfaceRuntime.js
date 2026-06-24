/**
 * Resolves live current-turn surface state for renderer desktop UI surfaces.
 */

import { DesktopResponseOverlayPhaseRuntime } from './desktopResponseOverlayPhaseRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from './desktopVisibleTurnLifecycleRuntime';

const {
  getAwaitingFirstChunkResponseOverlayPhase,
  getCompleteResponseOverlayPhase,
  getErrorResponseOverlayPhase,
  getIdleResponseOverlayPhase,
  getResponseOverlayPreflightGuardRef,
  getStreamingResponseOverlayPhase,
  getToolCallResponseOverlayPhase,
  getToolOutputResponseOverlayPhase,
} = DesktopResponseOverlayPhaseRuntime;
const {
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;

const CURRENT_TURN_PHASE_TO_SURFACE_PHASE = Object.freeze({
  awaiting: getAwaitingFirstChunkResponseOverlayPhase(),
  streaming: getStreamingResponseOverlayPhase(),
  tool_call: getToolCallResponseOverlayPhase(),
  tool_output: getToolOutputResponseOverlayPhase(),
  complete: getCompleteResponseOverlayPhase(),
  error: getErrorResponseOverlayPhase(),
  idle: getIdleResponseOverlayPhase(),
});

const CONVERSATION_VIEW_PHASE_TO_SURFACE_PHASE = Object.freeze({
  awaiting: getAwaitingFirstChunkResponseOverlayPhase(),
  streaming: getStreamingResponseOverlayPhase(),
  tool: getToolCallResponseOverlayPhase(),
  complete: getCompleteResponseOverlayPhase(),
  error: getErrorResponseOverlayPhase(),
  idle: getIdleResponseOverlayPhase(),
});

const VISIBLE_LIFECYCLE_STATUS_TO_SURFACE_PHASE = Object.freeze({
  local_pending: getAwaitingFirstChunkResponseOverlayPhase(),
  awaiting: getAwaitingFirstChunkResponseOverlayPhase(),
  active: getStreamingResponseOverlayPhase(),
  terminal: getCompleteResponseOverlayPhase(),
  idle: getIdleResponseOverlayPhase(),
});

function normalizePhase(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTurnRef(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeConversationRef(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mapCurrentTurnProjectionPhase(phase) {
  return CURRENT_TURN_PHASE_TO_SURFACE_PHASE[normalizePhase(phase)] ?? null;
}

function resolveVisibleLifecycleSurfacePhase(visibleTurnLifecycle, currentTurnProjection) {
  const status = normalizePhase(visibleTurnLifecycle?.status);
  if (status === 'active') {
    const mappedPhase = mapCurrentTurnProjectionPhase(currentTurnProjection?.phase);
    if (mappedPhase && mappedPhase !== getAwaitingFirstChunkResponseOverlayPhase()) {
      return mappedPhase;
    }
    return getStreamingResponseOverlayPhase();
  }
  if (status === 'terminal') {
    return (
      mapCurrentTurnProjectionPhase(currentTurnProjection?.phase)
      || VISIBLE_LIFECYCLE_STATUS_TO_SURFACE_PHASE[status]
      || getIdleResponseOverlayPhase()
    );
  }
  return (
    VISIBLE_LIFECYCLE_STATUS_TO_SURFACE_PHASE[status]
    || mapCurrentTurnProjectionPhase(currentTurnProjection?.phase)
    || getIdleResponseOverlayPhase()
  );
}

function hasSdkLiveTurnPresentation(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && Array.isArray(presentation.entries)
      && presentation.entries.length > 0,
  );
}

function hasConversationViewLiveTurnPresentation(conversationView) {
  return Boolean(
    conversationView
      && typeof conversationView === 'object'
      && conversationView.liveTurn
      && typeof conversationView.liveTurn === 'object'
      && Array.isArray(conversationView.liveTurn.entries),
  );
}

function mapConversationViewPhase(phase) {
  return CONVERSATION_VIEW_PHASE_TO_SURFACE_PHASE[normalizePhase(phase)] ?? null;
}

function resolveConversationViewOverlayIntent(conversationView) {
  const responseOverlay = conversationView?.surfaces?.responseOverlay;
  const rawMode = normalizePhase(responseOverlay?.mode);
  const mode = rawMode === 'typing'
    ? 'awaiting'
    : rawMode === 'response' || rawMode === 'hidden'
      ? rawMode
      : 'hidden';
  const turnRef = (
    normalizeTurnRef(responseOverlay?.turnRef)
    || normalizeTurnRef(conversationView?.liveTurn?.turnRef)
  );
  const conversationRef = (
    normalizeConversationRef(responseOverlay?.ownerConversationRef)
    || normalizeConversationRef(conversationView?.conversationRef)
  );
  const staleGuardRef = (
    normalizeTurnRef(responseOverlay?.guardRef)
    || turnRef
  );
  return {
    visible: responseOverlay?.visible === true && mode !== 'hidden',
    mode,
    turnRef,
    conversationRef,
    staleGuardRef,
  };
}

function hasProjectionVisibleOverlayContent(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  const entries = Array.isArray(presentation?.entries) ? presentation.entries : [];
  const toolEvents = Array.isArray(currentTurnProjection?.toolEvents)
    ? currentTurnProjection.toolEvents
    : [];
  return Boolean(
    normalizePhase(currentTurnProjection?.phase) === 'error'
      || normalizeString(currentTurnProjection?.assistantText)
      || normalizeString(currentTurnProjection?.reasoningText)
      || normalizeString(currentTurnProjection?.lastError)
      || entries.length > 0
      || toolEvents.some((event) => (
        event?.kind === 'tool_call'
        || event?.kind === 'tool_output'
        || event?.kind === 'tool_progress'
      )),
  );
}

function resolveSdkOverlayIntentMode(currentTurnProjection) {
  if (hasProjectionVisibleOverlayContent(currentTurnProjection)) {
    return 'response';
  }
  if (normalizePhase(currentTurnProjection?.phase) === 'awaiting') {
    return 'awaiting';
  }
  return 'hidden';
}

function resolveSdkOverlayIntent(presentation, currentTurnProjection) {
  const intent = presentation?.overlayIntent;
  const mode = resolveSdkOverlayIntentMode(currentTurnProjection);
  const turnRef = (
    normalizeTurnRef(intent?.turnRef)
    || normalizeTurnRef(currentTurnProjection?.turnRef)
  );
  const conversationRef = (
    normalizeConversationRef(intent?.conversationRef)
    || normalizeConversationRef(currentTurnProjection?.conversationRef)
  );
  const staleGuardRef = (
    normalizeTurnRef(intent?.staleGuardRef)
    || turnRef
  );
  return {
    visible: mode !== 'hidden',
    mode,
    turnRef,
    conversationRef,
    staleGuardRef,
  };
}

function resolveLiveTurnPresentationInput({
  currentTurnProjection = null,
  conversationView = null,
  pendingTurn = null,
  messages = [],
  visibleTurnLifecycle = null,
} = {}) {
  const useSdkLiveTurnPresentation = hasSdkLiveTurnPresentation(currentTurnProjection);
  const useConversationViewPresentation = hasConversationViewLiveTurnPresentation(conversationView);
  const resolvedVisibleTurnLifecycle = visibleTurnLifecycle ?? resolveVisibleTurnLifecycle({
    pendingTurn,
    currentTurnProjection,
    conversationView,
    messages,
  });
  const useLocalPendingTurn = resolvedVisibleTurnLifecycle?.status === 'local_pending';
  if (useLocalPendingTurn) {
    const turnRef = normalizeTurnRef(pendingTurn?.turnRef);
    const preflightGuardRef = getResponseOverlayPreflightGuardRef();
    const conversationRef = (
      normalizeConversationRef(pendingTurn?.conversationRef)
      || currentTurnProjection?.conversationRef
      || null
    );
    return {
      phase: getAwaitingFirstChunkResponseOverlayPhase(),
      isBusy: true,
      source: 'pending-turn',
      useLocalPendingTurn: true,
      useSdkLiveTurnPresentation,
      useConversationViewPresentation: false,
      overlayIntent: {
        visible: true,
        mode: 'awaiting',
        turnRef,
        conversationRef,
        staleGuardRef: preflightGuardRef,
      },
      entries: [],
      turnRef,
      conversationRef,
      guardRef: preflightGuardRef,
    };
  }

  const visibleLifecyclePhase = resolveVisibleLifecycleSurfacePhase(
    resolvedVisibleTurnLifecycle,
    currentTurnProjection,
  );
  const lifecycleIsBusy = resolvedVisibleTurnLifecycle?.isBusy === true;

  if (useConversationViewPresentation) {
    const overlayIntent = resolveConversationViewOverlayIntent(conversationView);
    const phase = (
      mapConversationViewPhase(conversationView.liveTurn?.phase)
      || visibleLifecyclePhase
    );
    return {
      phase,
      isBusy: conversationView.liveTurn?.isBusy === true,
      source: 'conversation-view',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation,
      useConversationViewPresentation: true,
      overlayIntent,
      entries: conversationView.liveTurn.entries,
      turnRef: overlayIntent.turnRef || conversationView.liveTurn?.turnRef || null,
      conversationRef: overlayIntent.conversationRef || conversationView.conversationRef || null,
      guardRef: overlayIntent.staleGuardRef || overlayIntent.turnRef || conversationView.liveTurn?.turnRef || null,
    };
  }

  if (useSdkLiveTurnPresentation) {
    const presentation = currentTurnProjection.presentation;
    const overlayIntent = resolveSdkOverlayIntent(presentation, currentTurnProjection);
    return {
      phase: visibleLifecyclePhase,
      isBusy: lifecycleIsBusy,
      source: 'sdk-current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: true,
      useConversationViewPresentation: false,
      overlayIntent,
      entries: Array.isArray(presentation.entries) ? presentation.entries : [],
      turnRef: overlayIntent.turnRef || currentTurnProjection?.turnRef || null,
      conversationRef: overlayIntent.conversationRef || currentTurnProjection?.conversationRef || null,
      guardRef: overlayIntent.staleGuardRef || overlayIntent.turnRef || currentTurnProjection?.turnRef || null,
    };
  }

  const currentTurnPhase = mapCurrentTurnProjectionPhase(currentTurnProjection?.phase);
  if (currentTurnPhase) {
    const overlayIntent = resolveSdkOverlayIntent(
      currentTurnProjection?.presentation,
      currentTurnProjection,
    );
    return {
      phase: visibleLifecyclePhase,
      isBusy: lifecycleIsBusy,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      useConversationViewPresentation: false,
      overlayIntent,
      entries: [],
      turnRef: overlayIntent.turnRef || currentTurnProjection?.turnRef || null,
      conversationRef: overlayIntent.conversationRef || currentTurnProjection?.conversationRef || null,
      guardRef: overlayIntent.staleGuardRef || overlayIntent.turnRef || currentTurnProjection?.turnRef || null,
    };
  }

  return {
    phase: getIdleResponseOverlayPhase(),
    isBusy: false,
    source: 'idle',
    useLocalPendingTurn: false,
    useSdkLiveTurnPresentation: false,
    useConversationViewPresentation: false,
    overlayIntent: null,
    entries: [],
    turnRef: null,
    conversationRef: null,
    guardRef: null,
  };
}

export const DesktopLiveTurnSurfaceRuntime = Object.freeze({
  resolveConversationViewOverlayIntent,
  resolveLiveTurnPresentationInput,
  resolveSdkOverlayIntent,
});
