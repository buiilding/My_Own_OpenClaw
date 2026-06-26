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
  buildSdkLiveTurnMessages,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
  isVisibleResponseOverlayMessage,
  resolveNoViewSdkLiveTurnThinkingText,
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
  text?: string | null;
  type?: string | null;
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

type ResponseOverlayTraceSummaryInput = {
  awaitingVisible?: boolean;
  currentTurnPhase?: string | null;
  isVisible?: boolean;
  latestResponseOverlayEntryId?: string | null;
  latestSourceTaggedResponseEntry?: ResponseOverlayEntryLike | null;
  messageCount?: number | null;
  overlayLayoutMode?: string | null;
  responseOverlayEntryCount?: number | null;
  responseOverlayEntries?: ResponseOverlayEntryLike[] | null;
  responseVisible?: boolean;
  thinkingText?: string | null;
  turnId?: string | null;
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

function normalizeCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function normalizeEntryThinkingText(entry: unknown): string {
  const message = recordFromUnknown(entry);
  const thinkingText = normalizeUnknownString(message.thinkingText) || '';
  if (thinkingText) {
    return thinkingText;
  }
  return message.type === 'thinking'
    ? normalizeUnknownString(message.text) || ''
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

function resolveDismissedResponseOverlayEntryId(
  state: ResponseOverlayDismissalState,
  input: ResponseOverlayDismissalInput | null | undefined,
): string | null {
  const responseEntryId = normalizeString(input?.responseEntryId);
  if (!responseEntryId || !isResponseOverlayEntryDismissedInState(state, {
    conversationRef: input?.conversationRef,
    turnRef: input?.turnRef,
    responseEntryId,
  })) {
    return null;
  }
  return responseEntryId;
}

function resolveLatestSourceTaggedResponseOverlayEntry({
  responseOverlayEntries = [],
}: {
  responseOverlayEntries?: ResponseOverlayEntryLike[] | null;
} = {}): ResponseOverlayEntryLike | null {
  if (!Array.isArray(responseOverlayEntries)) {
    return null;
  }
  for (let index = responseOverlayEntries.length - 1; index >= 0; index -= 1) {
    const entry = responseOverlayEntries[index];
    if (isResponseOverlaySourceTaggedMessage(entry)) {
      return entry;
    }
  }
  return null;
}

function buildResponseOverlayEntrySignature({
  responseOverlayEntries = [],
}: {
  responseOverlayEntries?: ResponseOverlayEntryLike[] | null;
} = {}): string {
  if (!Array.isArray(responseOverlayEntries)) {
    return '';
  }
  return responseOverlayEntries.map((entry) => `${entry.id}:${entry.text}`).join('\u0001');
}

function resolveResponseOverlayCloseable({
  isBusy = false,
  latestSourceTaggedResponseEntry = null,
  responseOverlayEntries = [],
  responseVisible = false,
}: {
  isBusy?: boolean;
  latestSourceTaggedResponseEntry?: ResponseOverlayEntryLike | null;
  responseOverlayEntries?: ResponseOverlayEntryLike[] | null;
  responseVisible?: boolean;
} = {}): boolean {
  if (responseVisible !== true || isBusy === true) {
    return false;
  }
  return isResponseCloseable(latestSourceTaggedResponseEntry)
    || (
      Array.isArray(responseOverlayEntries)
      && responseOverlayEntries.some(isResponseOverlayProgressMessage)
    );
}

function buildResponseOverlayTraceSummary({
  awaitingVisible = false,
  currentTurnPhase = null,
  isVisible = false,
  latestResponseOverlayEntryId = null,
  latestSourceTaggedResponseEntry = null,
  messageCount = 0,
  overlayLayoutMode = null,
  responseOverlayEntryCount = null,
  responseOverlayEntries = [],
  responseVisible = false,
  thinkingText = null,
  turnId = null,
}: ResponseOverlayTraceSummaryInput = {}) {
  const activeResponseText = typeof latestSourceTaggedResponseEntry?.text === 'string'
    ? latestSourceTaggedResponseEntry.text
    : '';
  const activeResponseTextLength = activeResponseText.length;
  const responseEntryCount = typeof responseOverlayEntryCount === 'number'
    ? normalizeCount(responseOverlayEntryCount)
    : Array.isArray(responseOverlayEntries)
    ? responseOverlayEntries.length
    : 0;
  const phase = normalizeString(currentTurnPhase) || 'idle';
  const normalizedTurnId = normalizeString(turnId);
  const visibleResponseId = normalizeString(latestResponseOverlayEntryId);
  const normalizedLayoutMode = normalizeString(overlayLayoutMode) || 'hidden';
  const normalizedMessageCount = normalizeCount(messageCount);
  const thinkingTextLength = typeof thinkingText === 'string' ? thinkingText.length : 0;
  const responseType = normalizeString(latestSourceTaggedResponseEntry?.type);

  return {
    signature: JSON.stringify({
      isVisible: isVisible === true,
      awaitingVisible: awaitingVisible === true,
      responseVisible: responseVisible === true,
      overlayLayoutMode: normalizedLayoutMode,
      phase,
      turnId: normalizedTurnId,
      visibleResponseId,
      activeResponseTextLength,
    }),
    stateTrace: {
      turnRef: normalizedTurnId,
      phase,
      isVisible: isVisible === true,
      awaitingVisible: awaitingVisible === true,
      responseVisible: responseVisible === true,
      responseLayoutMode: normalizedLayoutMode,
      visibleResponseId,
      responseEntryCount,
      activeResponseTextLength,
      thinkingText,
      messageCount: normalizedMessageCount,
    },
    snapshotTrace: {
      phase,
      messageCount: normalizedMessageCount,
      activeResponseTextLength,
      responseType,
      visibleResponseId,
      responseOverlayEntryCount: responseEntryCount,
      awaitingVisible: awaitingVisible === true,
      responseVisible: responseVisible === true,
      thinkingTextLength,
    },
    renderTrace: {
      turnRef: normalizedTurnId,
      phase,
      responseLayoutMode: normalizedLayoutMode,
      responseVisible: responseVisible === true,
      awaitingVisible: awaitingVisible === true,
    },
  };
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
  return resolveNoViewSdkLiveTurnThinkingText(sdkLiveTurn);
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
  return buildSdkLiveTurnMessages({
    conversationView: isConversationView(conversationView) ? conversationView : null,
    sdkLiveTurn,
  }).filter(isVisibleResponseOverlayMessage);
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
  buildResponseOverlayEntrySignature,
  buildResponseOverlayDismissalKey,
  buildResponseOverlayTraceSummary,
  createResponseOverlayWindowGuardSnapshot,
  isResponseOverlayEntryDismissedInState,
  resolveDismissedResponseOverlayEntryId,
  resolveLatestSourceTaggedResponseOverlayEntry,
  resolveResponseOverlayCloseable,
  resolveResponseOverlayEntries,
  resolveResponseOverlayPresentationState,
  resolveResponseOverlayPresentationStateForSurfaceState,
  resolveResponseOverlaySurfaceState,
  resolveResponseOverlayViewContract,
  resolveResponseOverlayWindowGuardSnapshot,
  resolveResponseOverlayWindowSizeIdentity,
});
