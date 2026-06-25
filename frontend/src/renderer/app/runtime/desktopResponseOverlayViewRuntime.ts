/**
 * Resolves response overlay view intent for renderer app-runtime consumers.
 */

import { DesktopResponseOverlayLayoutRuntime } from './desktopResponseOverlayLayoutRuntime';
import { DesktopCurrentTurnMessageRuntime } from './desktopCurrentTurnMessageRuntime';
import { DesktopCurrentTurnPresentationRuntime } from './desktopCurrentTurnPresentationRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from './desktopVisibleTurnLifecycleRuntime';

const AWAITING_VISIBLE_LIFECYCLE_STATUSES = new Set(['local_pending', 'awaiting']);
const {
  buildConversationViewLiveTurnMessages,
  buildCurrentTurnMessagesFromProjection,
  buildCurrentTurnMessagesFromPresentation,
  isVisibleResponseOverlayMessage,
} = DesktopCurrentTurnMessageRuntime;
const {
  resolveSdkResponseOverlayPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  applyVisibleTurnLifecycleToPresentationState,
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

function normalizeProjectedCurrentTurnEntries(currentTurnProjection: unknown): ResponseOverlayEntryLike[] {
  return buildCurrentTurnMessagesFromProjection(currentTurnProjection)
    .filter(isVisibleResponseOverlayMessage);
}

function resolveResponseOverlayEntries({
  conversationView = null,
  currentTurnProjection = null,
  liveTurnPresentationInput = {},
}: {
  conversationView?: unknown;
  currentTurnProjection?: unknown;
  liveTurnPresentationInput?: {
    source?: string | null;
    useLocalPendingTurn?: boolean;
    useSdkLiveTurnPresentation?: boolean;
  };
}): ResponseOverlayEntryLike[] {
  if (liveTurnPresentationInput.useLocalPendingTurn) {
    return [];
  }
  if (liveTurnPresentationInput.source === 'conversation-view') {
    return buildConversationViewLiveTurnMessages(conversationView)
      .filter(isVisibleResponseOverlayMessage);
  }
  if (liveTurnPresentationInput.useSdkLiveTurnPresentation) {
    const presentationMessages = buildCurrentTurnMessagesFromPresentation(currentTurnProjection)
      .filter(isVisibleResponseOverlayMessage);
    return presentationMessages.length > 0
      ? presentationMessages
      : normalizeProjectedCurrentTurnEntries(currentTurnProjection);
  }
  return normalizeProjectedCurrentTurnEntries(currentTurnProjection);
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
  currentTurnProjection = null,
  dismissedResponseId = null,
  liveTurnPresentationInput = {},
  responseOverlayEntries = [],
  visibleTurnLifecycle = null,
}: {
  currentTurnPresentationState: Record<string, unknown>;
  currentTurnProjection?: unknown;
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
      currentTurnProjection,
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

export const DesktopResponseOverlayViewRuntime = Object.freeze({
  resolveResponseOverlayEntries,
  resolveResponseOverlayPresentationState,
  resolveResponseOverlayViewContract,
});
