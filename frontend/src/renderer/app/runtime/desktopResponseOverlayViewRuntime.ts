/**
 * Resolves response overlay view intent for renderer app-runtime consumers.
 */

import { DesktopResponseOverlayLayoutRuntime } from './desktopResponseOverlayLayoutRuntime';
import { DesktopCurrentTurnMessageRuntime } from './desktopCurrentTurnMessageRuntime';
import { DesktopCurrentTurnPresentationRuntime } from './desktopCurrentTurnPresentationRuntime';
import { DesktopLiveTurnSurfaceRuntime } from './desktopLiveTurnSurfaceRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from './desktopVisibleTurnLifecycleRuntime';

const AWAITING_VISIBLE_LIFECYCLE_STATUSES = new Set(['local_pending', 'awaiting']);
const {
  buildConversationViewLiveTurnMessages,
  buildCurrentTurnMessagesFromSdkLiveTurn,
  buildCurrentTurnMessagesFromPresentation,
  isVisibleResponseOverlayMessage,
} = DesktopCurrentTurnMessageRuntime;
const {
  resolveResponseOverlayDismissalTarget,
  resolveSdkResponseOverlayPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;
const {
  applyVisibleTurnLifecycleToPresentationState,
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;

type CurrentTurnPresentationStateLike = {
  visibleTurnLifecycle?: {
    status?: string | null;
  } | null;
  visibleResponse?: {
    id?: string | null;
  } | null;
};

type ResponseOverlayEntryLike = {
  id?: string | null;
};

type ResponseOverlayDismissalInput = {
  conversationRef?: string | null;
  turnRef?: string | null;
  responseEntryId?: string | null;
};

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeReasoningText(reasoningText: unknown): string {
  return typeof reasoningText === 'string' ? reasoningText.trim() : '';
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isConversationView(value: unknown): boolean {
  const view = recordFromUnknown(value);
  return Boolean(
    view.conversationRef
      || view.displayRows
      || view.liveTurn
      || view.surfaces
      || view.actions,
  );
}

function buildResponseOverlayDismissalKey({
  conversationRef,
  turnRef,
  responseEntryId,
}: ResponseOverlayDismissalInput): string | null {
  const normalizedResponseEntryId = normalizeString(responseEntryId);
  if (!normalizedResponseEntryId) {
    return null;
  }
  return [
    normalizeString(conversationRef) || '',
    normalizeString(turnRef) || '',
    normalizedResponseEntryId,
  ].join('\u0001');
}

function resolveResponseOverlaySurfaceState({
  chatSurfaceState = null,
}: {
  chatSurfaceState?: unknown;
} = {}) {
  const surfaceState = recordFromUnknown(chatSurfaceState);
  const conversationView = isConversationView(surfaceState.conversationView)
    ? surfaceState.conversationView
    : null;
  const messages = conversationView
    ? []
    : Array.isArray(surfaceState.messages) ? surfaceState.messages : [];
  const sdkLiveTurn = conversationView ? null : surfaceState.sdkLiveTurn ?? null;
  const pendingTurn = surfaceState.pendingTurn ?? null;
  const visibleTurnLifecycle = resolveVisibleTurnLifecycle({
    conversationView,
    pendingTurn,
    sdkLiveTurn,
    messages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    conversationView,
    sdkLiveTurn,
    pendingTurn,
    messages,
    visibleTurnLifecycle,
  });
  const useSdkLiveTurnPresentation = liveTurnPresentationInput.useSdkLiveTurnPresentation;
  const useLocalPendingTurn = liveTurnPresentationInput.useLocalPendingTurn;
  const responseOverlayEntries = resolveResponseOverlayEntries({
    conversationView,
    sdkLiveTurn,
    liveTurnPresentationInput,
  });
  const responseOverlayDismissalTarget = resolveResponseOverlayDismissalTarget({
    sdkLiveTurn,
    overlayIntent: liveTurnPresentationInput.overlayIntent,
    responseOverlayEntries,
    useSdkLiveTurnPresentation,
  });
  const responseOverlayMessages = useLocalPendingTurn
    ? messages
    : responseOverlayEntries;
  return {
    currentTurnPhase: liveTurnPresentationInput.phase,
    liveTurnPresentationInput,
    messages,
    pendingTurn,
    responseOverlayDismissalTarget,
    responseOverlayEntries,
    responseOverlayMessages,
    sdkLiveTurn,
    thinkingText: normalizeReasoningText(
      recordFromUnknown(sdkLiveTurn).reasoningText,
    ),
    useLocalPendingTurn,
    useSdkLiveTurnPresentation,
    visibleTurnLifecycle,
  };
}

function normalizeProjectedCurrentTurnEntries(sdkLiveTurn: unknown): ResponseOverlayEntryLike[] {
  return buildCurrentTurnMessagesFromSdkLiveTurn(sdkLiveTurn)
    .filter(isVisibleResponseOverlayMessage);
}

function resolveResponseOverlayEntries({
  conversationView = null,
  sdkLiveTurn = null,
  liveTurnPresentationInput = {},
}: {
  conversationView?: unknown;
  sdkLiveTurn?: unknown;
  liveTurnPresentationInput?: {
    source?: string | null;
    useLocalPendingTurn?: boolean;
    useSdkLiveTurnPresentation?: boolean;
  };
}): ResponseOverlayEntryLike[] {
  if (liveTurnPresentationInput.useLocalPendingTurn) {
    return [];
  }
  if (isConversationView(conversationView)) {
    return buildConversationViewLiveTurnMessages(conversationView)
      .filter(isVisibleResponseOverlayMessage);
  }
  if (liveTurnPresentationInput.useSdkLiveTurnPresentation) {
    const presentationMessages = buildCurrentTurnMessagesFromPresentation(sdkLiveTurn)
      .filter(isVisibleResponseOverlayMessage);
    return presentationMessages.length > 0
      ? presentationMessages
      : normalizeProjectedCurrentTurnEntries(sdkLiveTurn);
  }
  return normalizeProjectedCurrentTurnEntries(sdkLiveTurn);
}

function resolveResponseOverlayViewContract({
  currentTurnPresentationState,
  responseOverlayEntries,
  dismissedResponseId = null,
}: {
  currentTurnPresentationState: CurrentTurnPresentationStateLike;
  responseOverlayEntries: ResponseOverlayEntryLike[];
  dismissedResponseId?: string | null;
}) {
  const latestResponseOverlayEntryId = responseOverlayEntries.length > 0
    ? responseOverlayEntries[responseOverlayEntries.length - 1].id || null
    : null;
  const visibleTurnLifecycleStatus = currentTurnPresentationState.visibleTurnLifecycle?.status;
  const awaitingReply = AWAITING_VISIBLE_LIFECYCLE_STATUSES.has(
    visibleTurnLifecycleStatus || '',
  );
  const visibleResponseId = currentTurnPresentationState.visibleResponse?.id || null;
  const isStaleVisibleResponseDuringAwaiting = (
    awaitingReply
    && AWAITING_VISIBLE_LIFECYCLE_STATUSES.has(visibleTurnLifecycleStatus || '')
    && visibleResponseId !== null
    && latestResponseOverlayEntryId === visibleResponseId
  );
  const responseVisible = (
    responseOverlayEntries.length > 0
    && latestResponseOverlayEntryId !== dismissedResponseId
    && !isStaleVisibleResponseDuringAwaiting
  );
  const awaitingVisible = !responseVisible && awaitingReply;
  const overlayLayoutMode = DesktopResponseOverlayLayoutRuntime.resolveResponseOverlayLayoutMode({
    responseVisible,
    awaitingVisible,
  });

  return {
    latestResponseOverlayEntryId,
    responseVisible,
    awaitingVisible,
    overlayLayoutMode,
    isVisible: DesktopResponseOverlayLayoutRuntime.isVisibleResponseOverlayLayoutMode(
      overlayLayoutMode,
    ),
  };
}

function resolveResponseOverlayPresentationState({
  currentTurnPresentationState,
  sdkLiveTurn = null,
  dismissedResponseId = null,
  liveTurnPresentationInput = {},
  responseOverlayEntries = [],
  visibleTurnLifecycle = null,
}: {
  currentTurnPresentationState: Record<string, unknown>;
  sdkLiveTurn?: unknown;
  dismissedResponseId?: string | null;
  liveTurnPresentationInput?: {
    overlayIntent?: unknown;
    source?: string | null;
    useLocalPendingTurn?: boolean;
    useSdkLiveTurnPresentation?: boolean;
  };
  responseOverlayEntries?: ResponseOverlayEntryLike[];
  visibleTurnLifecycle?: unknown;
}) {
  let presentationState;
  if (
    liveTurnPresentationInput.useSdkLiveTurnPresentation
    && !liveTurnPresentationInput.useLocalPendingTurn
    && liveTurnPresentationInput.source !== 'conversation-view'
  ) {
    presentationState = resolveSdkResponseOverlayPresentationState({
      sdkLiveTurn,
      responseOverlayEntries,
      dismissedResponseId,
      includeOverlayIntent: true,
    }) || currentTurnPresentationState;
  } else if (liveTurnPresentationInput.useLocalPendingTurn) {
    presentationState = {
      ...currentTurnPresentationState,
      overlayIntent: liveTurnPresentationInput.overlayIntent,
    };
  } else if (liveTurnPresentationInput.overlayIntent) {
    presentationState = {
      ...currentTurnPresentationState,
      overlayIntent: liveTurnPresentationInput.overlayIntent,
    };
  } else {
    presentationState = currentTurnPresentationState;
  }

  return applyVisibleTurnLifecycleToPresentationState(
    presentationState,
    visibleTurnLifecycle,
  );
}

function resolveResponseOverlayPresentationStateForSurfaceState({
  currentTurnPresentationState,
  dismissedResponseId = null,
  responseOverlaySurfaceState = {},
}: {
  currentTurnPresentationState: Record<string, unknown>;
  dismissedResponseId?: string | null;
  responseOverlaySurfaceState?: {
    sdkLiveTurn?: unknown;
    liveTurnPresentationInput?: {
      overlayIntent?: unknown;
      source?: string | null;
      useLocalPendingTurn?: boolean;
      useSdkLiveTurnPresentation?: boolean;
    };
    responseOverlayEntries?: ResponseOverlayEntryLike[];
    visibleTurnLifecycle?: unknown;
  };
}) {
  return resolveResponseOverlayPresentationState({
    currentTurnPresentationState,
    sdkLiveTurn: responseOverlaySurfaceState.sdkLiveTurn,
    dismissedResponseId,
    liveTurnPresentationInput: responseOverlaySurfaceState.liveTurnPresentationInput,
    responseOverlayEntries: responseOverlaySurfaceState.responseOverlayEntries,
    visibleTurnLifecycle: responseOverlaySurfaceState.visibleTurnLifecycle,
  });
}

export const DesktopResponseOverlayViewRuntime = Object.freeze({
  buildResponseOverlayDismissalKey,
  resolveResponseOverlayEntries,
  resolveResponseOverlayPresentationState,
  resolveResponseOverlayPresentationStateForSurfaceState,
  resolveResponseOverlaySurfaceState,
  resolveResponseOverlayViewContract,
});
