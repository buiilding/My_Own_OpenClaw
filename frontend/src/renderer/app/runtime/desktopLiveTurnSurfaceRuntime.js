/**
 * Resolves live current-turn surface state for renderer desktop UI surfaces.
 */

import { DesktopResponseOverlayPhaseRuntime } from './desktopResponseOverlayPhaseRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from './desktopVisibleTurnLifecycleRuntime';
import { DesktopConversationViewWorkspaceRuntime } from './desktopConversationViewWorkspaceRuntime';

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
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

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
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function normalizeTurnRef(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function normalizeConversationRef(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
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
      || normalizePhase(presentation?.lastError)
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
  const surfaceTurnRef = normalizeTurnRef(responseOverlaySurface?.turnRef);
  const surfaceConversationRef = (
    normalizeConversationRef(responseOverlaySurface?.ownerConversationRef)
    || normalizeConversationRef(responseOverlaySurface?.conversationRef)
  );
  const viewConversationRef = normalizeConversationRef(conversationView?.conversationRef);
  const conversationRef = (
    surfaceConversationRef
    || viewConversationRef
  );
  const canBorrowLiveTurnRef = !surfaceConversationRef || surfaceConversationRef === viewConversationRef;
  const turnRef = (
    surfaceTurnRef
    || (canBorrowLiveTurnRef ? normalizeTurnRef(liveTurn?.turnRef) : null)
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
  if (!hasWorkspaceConversationView({ conversationView })) {
    return false;
  }
  const liveTurn = conversationView?.liveTurn;
  const responseOverlaySurface = conversationView?.surfaces?.responseOverlay;
  return Boolean(
    liveTurn
      || responseOverlaySurface,
  );
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
      turnRef: overlayIntent.turnRef,
      conversationRef: overlayIntent.conversationRef,
      guardRef: overlayIntent.staleGuardRef,
    };
  }

  if (hasWorkspaceConversationView({ conversationView })) {
    const overlayIntent = resolveConversationViewOverlayIntent(conversationView);
    return {
      phase: getIdleResponseOverlayPhase(),
      isBusy: false,
      source: 'conversation-view',
      useLocalPendingTurn: false,
      useSdkLiveTurnPresentation: false,
      overlayIntent,
      entries: [],
      turnRef: overlayIntent.turnRef,
      conversationRef: overlayIntent.conversationRef,
      guardRef: overlayIntent.staleGuardRef,
    };
  }

  const useSdkLiveTurnPresentation = hasSdkLiveTurnPresentation(sdkLiveTurn);
  const visibleLifecyclePhase = resolveVisibleLifecycleSurfacePhase(
    resolvedVisibleTurnLifecycle,
    sdkLiveTurn,
  );
  const hasVisibleSdkLifecycle = normalizePhase(resolvedVisibleTurnLifecycle?.status) !== 'idle';
  const lifecycleIsBusy = resolvedVisibleTurnLifecycle?.isBusy === true;

  if (useSdkLiveTurnPresentation && hasVisibleSdkLifecycle) {
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
      turnRef: overlayIntent.turnRef,
      conversationRef: overlayIntent.conversationRef,
      guardRef: overlayIntent.staleGuardRef,
    };
  }

  const currentTurnPhase = mapSdkLiveTurnPhase(sdkLiveTurn?.phase);
  if (currentTurnPhase && hasVisibleSdkLifecycle) {
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
      turnRef: overlayIntent.turnRef,
      conversationRef: overlayIntent.conversationRef,
      guardRef: overlayIntent.staleGuardRef,
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
