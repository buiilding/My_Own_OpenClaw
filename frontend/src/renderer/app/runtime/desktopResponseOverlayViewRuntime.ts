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
  buildLegacyNoPresentationCurrentTurnMessages,
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

export type ResponseOverlayDismissalInput = {
  conversationRef?: string | null;
  turnRef?: string | null;
  responseEntryId?: string | null;
};

type ResponseOverlayDismissalState = {
  dismissedResponseOverlayEntries?: Record<string, true> | null;
};

type ResponseOverlayWindowGuardSnapshot = {
  conversationRef: string | null;
  turnRef: string | null;
  staleGuardRef: string | null;
};

type ResponseOverlayWindowGuardSnapshotInput = {
  overlayIntent?: {
    conversationRef?: unknown;
    turnRef?: unknown;
    staleGuardRef?: unknown;
  } | null;
  previousSnapshot?: Partial<ResponseOverlayWindowGuardSnapshot> | null;
};

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeUnknownString(value: unknown): string | null {
  return typeof value === 'string' ? normalizeString(value) : null;
}

function normalizeReasoningText(reasoningText: unknown): string {
  return typeof reasoningText === 'string' ? reasoningText.trim() : '';
}

function normalizeEntryThinkingText(entry: unknown): string {
  const message = recordFromUnknown(entry);
  const thinkingText = normalizeReasoningText(message.thinkingText);
  if (thinkingText) {
    return thinkingText;
  }
  return message.type === 'thinking'
    ? normalizeReasoningText(message.text)
    : '';
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
      || view.surfaces,
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

function buildDismissResponseOverlayEntryStateUpdate(
  state: ResponseOverlayDismissalState,
  input: ResponseOverlayDismissalInput,
): { dismissedResponseOverlayEntries: Record<string, true> } | null {
  const dismissalKey = buildResponseOverlayDismissalKey(input);
  const dismissedResponseOverlayEntries = state.dismissedResponseOverlayEntries || {};
  if (!dismissalKey || dismissedResponseOverlayEntries[dismissalKey]) {
    return null;
  }
  return {
    dismissedResponseOverlayEntries: {
      ...dismissedResponseOverlayEntries,
      [dismissalKey]: true,
    },
  };
}

function isResponseOverlayEntryDismissedInState(
  state: ResponseOverlayDismissalState,
  input: ResponseOverlayDismissalInput,
): boolean {
  const dismissalKey = buildResponseOverlayDismissalKey(input);
  return Boolean(
    dismissalKey
      && state.dismissedResponseOverlayEntries
      && state.dismissedResponseOverlayEntries[dismissalKey],
  );
}

function createResponseOverlayWindowGuardSnapshot(): ResponseOverlayWindowGuardSnapshot {
  return {
    conversationRef: null,
    turnRef: null,
    staleGuardRef: null,
  };
}

function resolveResponseOverlayWindowGuardSnapshot({
  overlayIntent = null,
  previousSnapshot = null,
}: ResponseOverlayWindowGuardSnapshotInput = {}): ResponseOverlayWindowGuardSnapshot {
  const currentConversationRef = normalizeUnknownString(overlayIntent?.conversationRef);
  const currentTurnRef = normalizeUnknownString(overlayIntent?.turnRef);
  const currentStaleGuardRef = (
    normalizeUnknownString(overlayIntent?.staleGuardRef)
    || currentTurnRef
  );
  const previousTurnRef = normalizeString(previousSnapshot?.turnRef);
  const previousStaleGuardRef = normalizeString(previousSnapshot?.staleGuardRef);

  if (currentTurnRef || currentStaleGuardRef) {
    return {
      conversationRef: currentConversationRef,
      turnRef: currentTurnRef,
      staleGuardRef: currentStaleGuardRef,
    };
  }

  return {
    conversationRef: currentConversationRef,
    turnRef: previousTurnRef,
    staleGuardRef: previousStaleGuardRef,
  };
}

function resolveResponseOverlayWindowSizeIdentity({
  overlayIntent = null,
  guardSnapshot = null,
}: {
  overlayIntent?: ResponseOverlayWindowGuardSnapshotInput['overlayIntent'];
  guardSnapshot?: Partial<ResponseOverlayWindowGuardSnapshot> | null;
} = {}): ResponseOverlayWindowGuardSnapshot {
  const intentConversationRef = normalizeUnknownString(overlayIntent?.conversationRef);
  const intentTurnRef = normalizeUnknownString(overlayIntent?.turnRef);
  const guardTurnRef = normalizeString(guardSnapshot?.turnRef);
  const turnRef = intentTurnRef || guardTurnRef;
  const staleGuardRef = (
    normalizeUnknownString(overlayIntent?.staleGuardRef)
    || intentTurnRef
    || normalizeString(guardSnapshot?.staleGuardRef)
    || guardTurnRef
  );

  return {
    conversationRef: intentConversationRef,
    turnRef,
    staleGuardRef,
  };
}

function resolveResponseOverlayThinkingText({
  responseOverlayEntries,
  sdkLiveTurn,
}: {
  responseOverlayEntries: ResponseOverlayEntryLike[];
  sdkLiveTurn?: unknown;
}): string {
  const thinkingText = responseOverlayEntries
    .map(normalizeEntryThinkingText)
    .filter(Boolean)
    .join('');
  if (thinkingText) {
    return thinkingText;
  }
  if (hasSdkLiveTurnPresentationObject(sdkLiveTurn)) {
    return '';
  }
  return normalizeReasoningText(
    recordFromUnknown(sdkLiveTurn).reasoningText,
  );
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
    thinkingText: resolveResponseOverlayThinkingText({
      responseOverlayEntries,
      sdkLiveTurn,
    }),
    useLocalPendingTurn,
    useSdkLiveTurnPresentation,
    visibleTurnLifecycle,
  };
}

function normalizeProjectedCurrentTurnEntries(sdkLiveTurn: unknown): ResponseOverlayEntryLike[] {
  return buildLegacyNoPresentationCurrentTurnMessages(sdkLiveTurn)
    .filter(isVisibleResponseOverlayMessage);
}

function hasSdkLiveTurnPresentationObject(sdkLiveTurn: unknown): boolean {
  const projection = recordFromUnknown(sdkLiveTurn);
  const presentation = projection.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && !Array.isArray(presentation),
  );
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
  if (hasSdkLiveTurnPresentationObject(sdkLiveTurn)) {
    return buildCurrentTurnMessagesFromPresentation(sdkLiveTurn)
      .filter(isVisibleResponseOverlayMessage);
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
  buildDismissResponseOverlayEntryStateUpdate,
  buildResponseOverlayDismissalKey,
  createResponseOverlayWindowGuardSnapshot,
  isResponseOverlayEntryDismissedInState,
  resolveResponseOverlayEntries,
  resolveResponseOverlayPresentationState,
  resolveResponseOverlayPresentationStateForSurfaceState,
  resolveResponseOverlaySurfaceState,
  resolveResponseOverlayViewContract,
  resolveResponseOverlayWindowGuardSnapshot,
  resolveResponseOverlayWindowSizeIdentity,
});
