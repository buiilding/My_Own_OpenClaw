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

const SDK_LIVE_TURN_PHASE_TO_SURFACE_PHASE = Object.freeze({
  awaiting: getAwaitingFirstChunkResponseOverlayPhase(),
  streaming: getStreamingResponseOverlayPhase(),
  tool_call: getToolCallResponseOverlayPhase(),
  tool_output: getToolOutputResponseOverlayPhase(),
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
const LEGACY_NO_PRESENTATION_RESPONSE_PHASES = new Set([
  'streaming',
  'tool_call',
  'tool_output',
  'complete',
  'error',
]);

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

function mapSdkLiveTurnPhase(phase) {
  return SDK_LIVE_TURN_PHASE_TO_SURFACE_PHASE[normalizePhase(phase)] ?? null;
}

function resolveVisibleLifecycleSurfacePhase(visibleTurnLifecycle, sdkLiveTurn) {
  const status = normalizePhase(visibleTurnLifecycle?.status);
  if (status === 'active') {
    const mappedPhase = mapSdkLiveTurnPhase(sdkLiveTurn?.phase);
    if (mappedPhase && mappedPhase !== getAwaitingFirstChunkResponseOverlayPhase()) {
      return mappedPhase;
    }
    return getStreamingResponseOverlayPhase();
  }
  if (status === 'terminal') {
    return (
      mapSdkLiveTurnPhase(sdkLiveTurn?.phase)
      || VISIBLE_LIFECYCLE_STATUS_TO_SURFACE_PHASE[status]
      || getIdleResponseOverlayPhase()
    );
  }
  return (
    VISIBLE_LIFECYCLE_STATUS_TO_SURFACE_PHASE[status]
    || mapSdkLiveTurnPhase(sdkLiveTurn?.phase)
    || getIdleResponseOverlayPhase()
  );
}

function hasSdkLiveTurnPresentation(sdkLiveTurn) {
  const presentation = sdkLiveTurn?.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && Array.isArray(presentation.entries)
      && presentation.entries.length > 0,
  );
}

function hasSdkLiveTurnPresentationObject(sdkLiveTurn) {
  const presentation = sdkLiveTurn?.presentation;
  return Boolean(presentation && typeof presentation === 'object');
}

function hasSdkLiveTurnVisibleOverlayContent(presentation) {
  const entries = Array.isArray(presentation?.entries) ? presentation.entries : [];
  return Boolean(
    entries.length > 0
      || normalizeString(presentation?.lastError)
  );
}

function resolveSdkOverlayIntentMode(presentation, sdkLiveTurn) {
  const presentationMode = normalizeSurfaceOverlayMode(presentation?.overlayIntent?.mode);
  if (hasSdkLiveTurnVisibleOverlayContent(presentation)) {
    return 'response';
  }
  if (
    presentationMode === 'awaiting'
    || normalizePhase(sdkLiveTurn?.phase) === 'awaiting'
    || presentation?.isBusy === true
  ) {
    return 'awaiting';
  }
  if (hasSdkLiveTurnPresentationObject(sdkLiveTurn)) {
    return 'hidden';
  }
  if (LEGACY_NO_PRESENTATION_RESPONSE_PHASES.has(normalizePhase(sdkLiveTurn?.phase))) {
    return 'response';
  }
  return 'hidden';
}

function normalizeSurfaceOverlayMode(value) {
  const normalized = normalizePhase(value);
  if (normalized === 'typing' || normalized === 'awaiting') {
    return 'awaiting';
  }
  if (normalized === 'response') {
    return 'response';
  }
  return 'hidden';
}

function resolveConversationViewOverlayIntent(conversationView) {
  const responseOverlaySurface = conversationView?.surfaces?.responseOverlay;
  const liveTurn = conversationView?.liveTurn;
  const mode = normalizeSurfaceOverlayMode(responseOverlaySurface?.mode);
  const turnRef = (
    normalizeTurnRef(responseOverlaySurface?.turnRef)
    || normalizeTurnRef(liveTurn?.turnRef)
  );
  const conversationRef = (
    normalizeConversationRef(responseOverlaySurface?.ownerConversationRef)
    || normalizeConversationRef(responseOverlaySurface?.conversationRef)
    || normalizeConversationRef(conversationView?.conversationRef)
  );
  const staleGuardRef = (
    normalizeTurnRef(responseOverlaySurface?.guardRef)
    || normalizeTurnRef(responseOverlaySurface?.staleGuardRef)
    || turnRef
  );
  return {
    visible: responseOverlaySurface?.visible === true || mode !== 'hidden',
    mode,
    turnRef,
    conversationRef,
    staleGuardRef,
  };
}

function resolveConversationViewSurfacePhase(conversationView) {
  const responseOverlaySurface = conversationView?.surfaces?.responseOverlay;
  const liveTurn = conversationView?.liveTurn;
  const mode = normalizeSurfaceOverlayMode(responseOverlaySurface?.mode);
  if (mode === 'awaiting') {
    return getAwaitingFirstChunkResponseOverlayPhase();
  }
  if (mode === 'response') {
    return mapSdkLiveTurnPhase(liveTurn?.phase) || getStreamingResponseOverlayPhase();
  }
  return mapSdkLiveTurnPhase(liveTurn?.phase) || getIdleResponseOverlayPhase();
}

function hasConversationViewLiveTurn(conversationView) {
  const liveTurn = conversationView?.liveTurn;
  const responseOverlaySurface = conversationView?.surfaces?.responseOverlay;
  return Boolean(
    conversationView
      && typeof conversationView === 'object'
      && (
        liveTurn
        || responseOverlaySurface
      ),
  );
}

function isConversationView(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveSdkOverlayIntent(presentation, sdkLiveTurn) {
  const intent = presentation?.overlayIntent;
  const mode = resolveSdkOverlayIntentMode(presentation, sdkLiveTurn);
  const turnRef = (
    normalizeTurnRef(intent?.turnRef)
    || normalizeTurnRef(sdkLiveTurn?.turnRef)
  );
  const conversationRef = (
    normalizeConversationRef(intent?.conversationRef)
    || normalizeConversationRef(sdkLiveTurn?.conversationRef)
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
  conversationView = null,
  sdkLiveTurn = null,
  pendingTurn = null,
  messages = [],
  visibleTurnLifecycle = null,
} = {}) {
  const resolvedVisibleTurnLifecycle = visibleTurnLifecycle ?? resolveVisibleTurnLifecycle({
    conversationView,
    pendingTurn,
    sdkLiveTurn,
    messages,
  });
  const useLocalPendingTurn = resolvedVisibleTurnLifecycle?.status === 'local_pending';
  if (useLocalPendingTurn) {
    const turnRef = normalizeTurnRef(pendingTurn?.turnRef);
    const preflightGuardRef = getResponseOverlayPreflightGuardRef();
    const conversationRef = normalizeConversationRef(pendingTurn?.conversationRef);
    return {
      phase: getAwaitingFirstChunkResponseOverlayPhase(),
      isBusy: true,
      source: 'pending-turn',
      useLocalPendingTurn: true,
      useSdkLiveTurnPresentation: false,
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

  if (hasConversationViewLiveTurn(conversationView)) {
    const liveTurn = conversationView.liveTurn || {};
    const overlayIntent = resolveConversationViewOverlayIntent(conversationView);
    const entries = Array.isArray(liveTurn.entries) ? liveTurn.entries : [];
    return {
      phase: resolveConversationViewSurfacePhase(conversationView),
      isBusy: liveTurn.isBusy === true,
      source: 'conversation-view',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: entries.length > 0,
      overlayIntent,
      entries,
      turnRef: overlayIntent.turnRef || liveTurn.turnRef || null,
      conversationRef: overlayIntent.conversationRef || conversationView.conversationRef || null,
      guardRef: overlayIntent.staleGuardRef || overlayIntent.turnRef || liveTurn.turnRef || null,
    };
  }

  if (isConversationView(conversationView)) {
    return {
      phase: getIdleResponseOverlayPhase(),
      isBusy: false,
      source: 'conversation-view',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent: resolveConversationViewOverlayIntent(conversationView),
      entries: [],
      turnRef: normalizeTurnRef(conversationView.liveTurn?.turnRef),
      conversationRef: normalizeConversationRef(conversationView.conversationRef),
      guardRef: normalizeTurnRef(conversationView.liveTurn?.turnRef),
    };
  }

  const useSdkLiveTurnPresentation = hasSdkLiveTurnPresentation(sdkLiveTurn);
  const visibleLifecyclePhase = resolveVisibleLifecycleSurfacePhase(
    resolvedVisibleTurnLifecycle,
    sdkLiveTurn,
  );
  const lifecycleIsBusy = resolvedVisibleTurnLifecycle?.isBusy === true;

  if (useSdkLiveTurnPresentation) {
    const presentation = sdkLiveTurn.presentation;
    const overlayIntent = resolveSdkOverlayIntent(presentation, sdkLiveTurn);
    return {
      phase: visibleLifecyclePhase,
      isBusy: lifecycleIsBusy,
      source: 'sdk-current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: true,
      overlayIntent,
      entries: Array.isArray(presentation.entries) ? presentation.entries : [],
      turnRef: overlayIntent.turnRef || sdkLiveTurn?.turnRef || null,
      conversationRef: overlayIntent.conversationRef || sdkLiveTurn?.conversationRef || null,
      guardRef: overlayIntent.staleGuardRef || overlayIntent.turnRef || sdkLiveTurn?.turnRef || null,
    };
  }

  const currentTurnPhase = mapSdkLiveTurnPhase(sdkLiveTurn?.phase);
  if (currentTurnPhase) {
    const overlayIntent = resolveSdkOverlayIntent(
      sdkLiveTurn?.presentation,
      sdkLiveTurn,
    );
    return {
      phase: visibleLifecyclePhase,
      isBusy: lifecycleIsBusy,
      source: 'current-turn',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent,
      entries: [],
      turnRef: overlayIntent.turnRef || sdkLiveTurn?.turnRef || null,
      conversationRef: overlayIntent.conversationRef || sdkLiveTurn?.conversationRef || null,
      guardRef: overlayIntent.staleGuardRef || overlayIntent.turnRef || sdkLiveTurn?.turnRef || null,
    };
  }

  return {
    phase: getIdleResponseOverlayPhase(),
    isBusy: false,
    source: 'idle',
    useLocalPendingTurn: false,
    useSdkLiveTurnPresentation: false,
    overlayIntent: null,
    entries: [],
    turnRef: null,
    conversationRef: null,
    guardRef: null,
  };
}

export const DesktopLiveTurnSurfaceRuntime = Object.freeze({
  resolveLiveTurnPresentationInput,
  resolveConversationViewOverlayIntent,
  resolveSdkOverlayIntent,
});
