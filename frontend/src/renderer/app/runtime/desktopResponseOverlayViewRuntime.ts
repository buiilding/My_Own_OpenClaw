/**
 * Resolves response overlay view intent for renderer app-runtime consumers.
 */

import { DesktopResponseOverlayLayoutRuntime } from './desktopResponseOverlayLayoutRuntime';
import { DesktopCurrentTurnMessageRuntime } from './desktopCurrentTurnMessageRuntime';
import { DesktopCurrentTurnPresentationRuntime } from './desktopCurrentTurnPresentationRuntime';
import { DesktopLiveTurnSurfaceRuntime } from './desktopLiveTurnSurfaceRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from './desktopVisibleTurnLifecycleRuntime';
import { DesktopConversationDisplayProjection } from './desktopConversationDisplayProjection';
import { DesktopConversationViewWorkspaceRuntime } from './desktopConversationViewWorkspaceRuntime';
import type { ConversationView } from './desktopConversationRuntimeContracts';

const AWAITING_VISIBLE_LIFECYCLE_STATUSES = new Set(['local_pending', 'awaiting']);
const {
  buildSdkLiveTurnMessages,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
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
const {
  buildConversationViewTurnChatMessages,
} = DesktopConversationDisplayProjection;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

type CurrentTurnPresentationStateLike = {
  visibleTurnLifecycle?: {
    status?: string | null;
  } | null;
  visibleResponse?: {
    id?: string | null;
  } | null;
};

type ResponseOverlayEntryLike = {
  correlationId?: string | null;
  id?: string | null;
  toolCallDetails?: Record<string, unknown> | null;
  toolOutputDetails?: Record<string, unknown> | null;
  text?: string | null;
  type?: string | null;
  sourceEventType?: string | null;
  turnRef?: string | null;
};

export type ResponseOverlayDismissalInput = {
  conversationRef?: string | null;
  guardRef?: string | null;
  turnRef?: string | null;
  responseEntryId?: string | null;
};

type ResponseOverlayDismissalState = {
  dismissedResponseOverlayEntries?: Record<string, true> | null;
};

type DismissResponseOverlayActionInput = {
  responseEntryId?: string | null;
  responseOverlayDismissalTarget?: ResponseOverlayDismissalInput | null;
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

type ResponseOverlayWindowSizeRuntimeInput = {
  action: 'hide-requested' | 'show-or-resize-requested';
  compactHover?: boolean;
  height?: number;
  layoutMode?: string | null;
  responseVisible?: boolean;
  sizeIdentity?: Partial<ResponseOverlayWindowGuardSnapshot> | null;
  thinkingText?: string | null;
  visible: boolean;
  width?: number;
};

type ResponseOverlayWindowLifecycleRuntimeInput = {
  action: 'mount' | 'unmount';
  guardSnapshot?: Partial<ResponseOverlayWindowGuardSnapshot> | null;
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

type ResponseOverlayTypingRenderedTraceInput = {
  awaitingVisible?: boolean;
  currentTurnPhase?: string | null;
  isVisible?: boolean;
  overlayIntent?: {
    conversationRef?: unknown;
    mode?: unknown;
    staleGuardRef?: unknown;
    turnRef?: unknown;
  } | null;
  overlayLayoutMode?: string | null;
  responseOverlayEntryCount?: number | null;
  responseVisible?: boolean;
  turnId?: string | null;
  typingRendered?: boolean;
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

function exactIdentityString(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function exactUnknownIdentityString(value: unknown): string | null {
  return typeof value === 'string' ? exactIdentityString(value) : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveNoViewResponseOverlayThinkingText(sdkLiveTurn: unknown): string {
  const liveTurn = recordFromUnknown(sdkLiveTurn);
  if (isRecord(liveTurn.presentation)) {
    return '';
  }
  return normalizeUnknownString(liveTurn.reasoningText) || '';
}

function stringField(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function conversationViewLiveTurnRef(conversationView: ConversationView): string | null {
  const view = recordFromUnknown(conversationView);
  const liveTurn = recordFromUnknown(view.liveTurn);
  const surfaces = recordFromUnknown(view.surfaces);
  const responseOverlay = recordFromUnknown(surfaces.responseOverlay);
  return (
    normalizeUnknownString(liveTurn.turnRef)
    || normalizeUnknownString(responseOverlay.turnRef)
    || null
  );
}

function responseOverlayDisplayRowMessages(conversationView: ConversationView): ResponseOverlayEntryLike[] {
  const liveTurnRef = conversationViewLiveTurnRef(conversationView);
  if (!liveTurnRef) {
    return [];
  }
  return buildConversationViewTurnChatMessages({
    conversationView,
    turnRef: liveTurnRef,
  })
    .filter(isVisibleResponseOverlayMessage);
}

function responseOverlayMaterializedSourceTypes(
  displayMessages: ResponseOverlayEntryLike[],
): Set<string> {
  const materializedTypes = new Set<string>();
  displayMessages.forEach((message) => {
    if (isToolOverlayMessage(message)) {
      return;
    }
    const sourceEventType = normalizeString(message.sourceEventType);
    if (sourceEventType) {
      materializedTypes.add(sourceEventType);
    }
    const type = normalizeString(message.type);
    if (type) {
      materializedTypes.add(type);
    }
  });
  return materializedTypes;
}

const TOOL_OVERLAY_MESSAGE_TYPES = new Set([
  'tool-call',
  'tool-output',
  'tool-progress',
  'search-source',
  'tool-explanation',
]);

function isToolOverlayMessage(message: ResponseOverlayEntryLike): boolean {
  return Boolean(TOOL_OVERLAY_MESSAGE_TYPES.has(normalizeString(message.type) || ''));
}

function identityFromToolRecord(record: Record<string, unknown> | null): string | null {
  const metadata = recordFromUnknown(record?.metadata);
  return stringField(
    record,
    'displayCorrelationId',
    'toolCallId',
    'tool_call_id',
    'id',
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'correlationId',
    'correlation_id',
  ) ?? stringField(
    metadata,
    'displayCorrelationId',
    'toolCallId',
    'tool_call_id',
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'correlationId',
    'correlation_id',
  );
}

function toolOverlayMessageIdentity(message: ResponseOverlayEntryLike): string | null {
  return normalizeString(message.correlationId)
    ?? identityFromToolRecord(recordFromUnknown(message.toolCallDetails))
    ?? identityFromToolRecord(recordFromUnknown(message.toolOutputDetails));
}

function toolOverlayTypesMatch(
  displayMessage: ResponseOverlayEntryLike,
  liveMessage: ResponseOverlayEntryLike,
): boolean {
  return normalizeString(displayMessage.type) === normalizeString(liveMessage.type);
}

function toolLiveEntryMaterializedByDisplayRows(
  liveMessage: ResponseOverlayEntryLike,
  displayMessages: ResponseOverlayEntryLike[],
): boolean {
  const liveIdentity = toolOverlayMessageIdentity(liveMessage);
  if (!liveIdentity) {
    return false;
  }
  return displayMessages.some((displayMessage) => (
    isToolOverlayMessage(displayMessage)
    && toolOverlayTypesMatch(displayMessage, liveMessage)
    && toolOverlayMessageIdentity(displayMessage) === liveIdentity
  ));
}

function liveEntryMaterializedByDisplayRows(
  liveMessage: ResponseOverlayEntryLike,
  displayMessages: ResponseOverlayEntryLike[],
  materializedTypes: Set<string>,
): boolean {
  if (isToolOverlayMessage(liveMessage)) {
    return toolLiveEntryMaterializedByDisplayRows(liveMessage, displayMessages);
  }
  const sourceEventType = normalizeString(liveMessage.sourceEventType);
  if (sourceEventType && materializedTypes.has(sourceEventType)) {
    return true;
  }
  const type = normalizeString(liveMessage.type);
  return Boolean(type && materializedTypes.has(type));
}

function mergeConversationViewOverlayMessages(conversationView: ConversationView): ResponseOverlayEntryLike[] {
  const displayMessages = responseOverlayDisplayRowMessages(conversationView);
  const liveMessages = buildSdkLiveTurnMessages({
    conversationView,
    sdkLiveTurn: null,
  }).filter(isVisibleResponseOverlayMessage);
  if (displayMessages.length === 0) {
    return liveMessages;
  }
  const materializedTypes = responseOverlayMaterializedSourceTypes(displayMessages);
  const liveOnlyMessages = liveMessages.filter(
    (message) => !liveEntryMaterializedByDisplayRows(message, displayMessages, materializedTypes),
  );
  return [
    ...displayMessages,
    ...liveOnlyMessages,
  ];
}

function buildResponseOverlayDismissalKey({
  conversationRef,
  turnRef,
  responseEntryId,
}: ResponseOverlayDismissalInput): string | null {
  const normalizedResponseEntryId = exactIdentityString(responseEntryId);
  if (!normalizedResponseEntryId) {
    return null;
  }
  return [
    exactIdentityString(conversationRef) || '',
    exactIdentityString(turnRef) || '',
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
  const responseEntryId = exactIdentityString(input?.responseEntryId);
  if (!responseEntryId || !isResponseOverlayEntryDismissedInState(state, {
    conversationRef: input?.conversationRef,
    turnRef: input?.turnRef,
    responseEntryId,
  })) {
    return null;
  }
  return responseEntryId;
}

function buildDismissResponseOverlayAction({
  responseEntryId = null,
  responseOverlayDismissalTarget = null,
}: DismissResponseOverlayActionInput = {}) {
  const normalizedResponseEntryId = exactIdentityString(responseEntryId);
  if (!responseOverlayDismissalTarget || !normalizedResponseEntryId) {
    return null;
  }
  const dismissalTarget = {
    ...responseOverlayDismissalTarget,
    responseEntryId: normalizedResponseEntryId,
  };
  return {
    dismissalTarget,
    responseboxDismissalValues: {
      turnRef: exactIdentityString(dismissalTarget.turnRef),
      guardRef: exactIdentityString(dismissalTarget.guardRef),
    },
  };
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

function buildResponseOverlayTypingRenderedTraceValues({
  awaitingVisible = false,
  currentTurnPhase = null,
  isVisible = false,
  overlayIntent = null,
  overlayLayoutMode = null,
  responseOverlayEntryCount = 0,
  responseVisible = false,
  turnId = null,
  typingRendered = false,
}: ResponseOverlayTypingRenderedTraceInput = {}) {
  const normalizedTurnId = normalizeString(turnId);
  return {
    typingRendered: typingRendered === true,
    turnRef: normalizedTurnId,
    currentTurnId: normalizedTurnId,
    phase: normalizeString(currentTurnPhase) || 'idle',
    overlayIntent,
    overlayLayoutMode: normalizeString(overlayLayoutMode) || null,
    isVisible: isVisible === true,
    awaitingVisible: awaitingVisible === true,
    responseVisible: responseVisible === true,
    responseOverlayEntryCount: normalizeCount(responseOverlayEntryCount),
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
  const currentConversationRef = exactUnknownIdentityString(overlayIntent?.conversationRef);
  const currentTurnRef = exactUnknownIdentityString(overlayIntent?.turnRef);
  const currentStaleGuardRef = (
    exactUnknownIdentityString(overlayIntent?.staleGuardRef)
    || currentTurnRef
  );
  const previousTurnRef = exactIdentityString(previousSnapshot?.turnRef);
  const previousStaleGuardRef = exactIdentityString(previousSnapshot?.staleGuardRef);

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
  const intentConversationRef = exactUnknownIdentityString(overlayIntent?.conversationRef);
  const intentTurnRef = exactUnknownIdentityString(overlayIntent?.turnRef);
  const guardTurnRef = exactIdentityString(guardSnapshot?.turnRef);
  const turnRef = intentTurnRef || guardTurnRef;
  const staleGuardRef = (
    exactUnknownIdentityString(overlayIntent?.staleGuardRef)
    || intentTurnRef
    || exactIdentityString(guardSnapshot?.staleGuardRef)
    || guardTurnRef
  );

  return {
    conversationRef: intentConversationRef,
    turnRef,
    staleGuardRef,
  };
}

function buildResponseOverlayWindowSizeTraceValues({
  action,
  compactHover = false,
  height = 0,
  layoutMode = null,
  responseVisible = false,
  sizeIdentity = null,
  thinkingText = null,
  visible,
  width = 0,
}: ResponseOverlayWindowSizeRuntimeInput) {
  return {
    action,
    conversationRef: exactIdentityString(sizeIdentity?.conversationRef),
    visible: visible === true,
    layoutMode,
    responseVisible,
    thinkingText,
    compactHover: Boolean(compactHover),
    turnRef: exactIdentityString(sizeIdentity?.turnRef),
    staleGuardRef: exactIdentityString(sizeIdentity?.staleGuardRef),
    width,
    height,
  };
}

function buildResponseOverlayWindowSizeValues({
  compactHover = false,
  height = 0,
  sizeIdentity = null,
  visible,
  width = 0,
}: Omit<ResponseOverlayWindowSizeRuntimeInput, 'action' | 'layoutMode' | 'responseVisible' | 'thinkingText'>) {
  const values: {
    visible: boolean;
    width: number;
    height: number;
    compactHover?: boolean;
    turnRef: string | null;
    staleGuardRef: string | null;
  } = {
    visible: visible === true,
    width,
    height,
    turnRef: exactIdentityString(sizeIdentity?.turnRef),
    staleGuardRef: exactIdentityString(sizeIdentity?.staleGuardRef),
  };
  if (visible === true) {
    values.compactHover = Boolean(compactHover);
  }
  return values;
}

function buildResponseOverlayWindowLifecycleTraceValues({
  action,
  guardSnapshot = null,
}: ResponseOverlayWindowLifecycleRuntimeInput) {
  return {
    action,
    conversationRef: exactIdentityString(guardSnapshot?.conversationRef),
    turnRef: exactIdentityString(guardSnapshot?.turnRef),
    staleGuardRef: exactIdentityString(guardSnapshot?.staleGuardRef),
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
  return resolveNoViewResponseOverlayThinkingText(sdkLiveTurn);
}

function resolveResponseOverlaySurfaceState({
  chatSurfaceState = null,
}: {
  chatSurfaceState?: unknown;
} = {}) {
  const surfaceState = recordFromUnknown(chatSurfaceState);
  const conversationView = hasWorkspaceConversationView({ conversationView: surfaceState.conversationView })
    ? surfaceState.conversationView as ConversationView
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
  if (hasWorkspaceConversationView({ conversationView })) {
    return mergeConversationViewOverlayMessages(conversationView as ConversationView);
  }
  return buildSdkLiveTurnMessages({
    conversationView: null,
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
  buildDismissResponseOverlayAction,
  buildResponseOverlayEntrySignature,
  buildResponseOverlayDismissalKey,
  buildResponseOverlayTraceSummary,
  buildResponseOverlayTypingRenderedTraceValues,
  buildResponseOverlayWindowLifecycleTraceValues,
  buildResponseOverlayWindowSizeTraceValues,
  buildResponseOverlayWindowSizeValues,
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
