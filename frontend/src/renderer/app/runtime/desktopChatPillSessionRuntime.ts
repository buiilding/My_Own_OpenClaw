/**
 * Resolves chat-pill send lifecycle and response overlay view intent.
 */

import {
  DesktopMessageSendUiRuntime,
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from './desktopMessageSendUiRuntime';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';
import { DesktopResponseOverlayViewRuntime } from './desktopResponseOverlayViewRuntime';

const {
  resolveMessageSendUiBehavior,
} = DesktopMessageSendUiRuntime;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;
const {
  resolveResponseOverlayViewContract,
} = DesktopResponseOverlayViewRuntime;

type TurnRefMessage = {
  id?: string | null;
  turnRef?: string | null;
};

type TurnRefSource = {
  turnRef?: string | null;
} | null | undefined;

type ChatPillSurfaceState = {
  conversationView?: unknown;
  messages?: unknown[] | null;
  sdkLiveTurn?: unknown;
} | null | undefined;

type ChatPillLifecycleTraceSnapshot = {
  conversationRef: string | null;
  turnRef: string | null;
  phase: string | null;
};

type ChatPillLifecycleTraceValuesInput = {
  action: 'mount' | 'unmount';
  snapshot: ChatPillLifecycleTraceSnapshot;
};

type ChatPillResetTraceValuesInput = {
  attachmentCount?: number;
  includeQueryScreenshot?: boolean;
  snapshot: ChatPillLifecycleTraceSnapshot;
};

const CHAT_PILL_SURFACE_REASON = Object.freeze({
  QUERY_SEND_WITH_CAPTURE: 'query_send_with_capture',
  QUERY_SEND_WITHOUT_CAPTURE: 'query_send_without_capture',
  TOOL_INTERACTIVE: 'tool_interactive',
  TOOL_SCREENSHOT: 'tool_screenshot',
});

function readExactNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > 0 && value === value.trim() ? value : null;
}

function normalizeOptionalTurnRef(value: unknown): string | null {
  return readExactNonEmptyString(value);
}

function normalizeOptionalString(value: unknown): string | null {
  return readExactNonEmptyString(value);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readLiveTurn(conversationView: unknown): Record<string, unknown> | null {
  return objectRecord(objectRecord(conversationView)?.liveTurn);
}

function resolveViewLiveTurnRef(conversationView: unknown): string | null {
  return normalizeOptionalTurnRef(readLiveTurn(conversationView)?.turnRef);
}

function resolveViewLiveTurnPhase(conversationView: unknown): string | null {
  return normalizeOptionalString(readLiveTurn(conversationView)?.phase);
}

function resolveViewCanStop(conversationView: unknown): boolean {
  return readLiveTurn(conversationView)?.canStop === true;
}

function resolveViewPillMode(conversationView: unknown): string | null {
  const surfaces = objectRecord(objectRecord(conversationView)?.surfaces);
  return normalizeOptionalString(objectRecord(surfaces?.pill)?.mode);
}

function resolveNoViewLiveTurnRef(sdkLiveTurn: unknown): string | null {
  return normalizeOptionalTurnRef(objectRecord(sdkLiveTurn)?.turnRef);
}

function resolveNoViewLiveTurnPhase(sdkLiveTurn: unknown): string | null {
  return normalizeOptionalString(objectRecord(sdkLiveTurn)?.phase);
}

function resolveChatPillSendLifecycle({
  senderSurface = 'overlay-chatbox',
  returnToChatboxPolicy,
  includeQueryScreenshot,
}: {
  senderSurface?: ChatSendSurface;
  returnToChatboxPolicy?: ReturnToChatboxPolicy;
  includeQueryScreenshot: boolean;
}) {
  const shouldCaptureQueryScreenshot = senderSurface !== 'main-window' && includeQueryScreenshot;
  const sendUiBehavior = resolveMessageSendUiBehavior({
    senderSurface,
    returnToChatboxPolicy,
    includeQueryScreenshot: shouldCaptureQueryScreenshot,
  });
  const shouldReturnToChatboxOnSend = senderSurface === 'main-window'
    ? false
    : sendUiBehavior.shouldReturnToChatboxOnSend;

  return {
    senderSurface,
    sendUiBehavior,
    shouldCaptureQueryScreenshot,
    shouldReturnToChatboxOnSend,
    surfaceReason: shouldCaptureQueryScreenshot
      ? CHAT_PILL_SURFACE_REASON.QUERY_SEND_WITH_CAPTURE
      : CHAT_PILL_SURFACE_REASON.QUERY_SEND_WITHOUT_CAPTURE,
  };
}

function resolveChatPillTurnId({
  currentTurnPresentationState,
  overlayIntent = null,
  pendingTurn = null,
  visibleTurnLifecycle = null,
}: {
  currentTurnPresentationState: {
    activeResponse?: TurnRefMessage | null;
    visibleResponse?: TurnRefMessage | null;
    visibleTurnLifecycle?: TurnRefSource;
  };
  overlayIntent?: TurnRefSource;
  pendingTurn?: TurnRefSource;
  visibleTurnLifecycle?: TurnRefSource;
}) {
  return (
    normalizeOptionalTurnRef(currentTurnPresentationState.visibleResponse?.turnRef)
    || normalizeOptionalTurnRef(currentTurnPresentationState.activeResponse?.turnRef)
    || normalizeOptionalTurnRef(currentTurnPresentationState.visibleTurnLifecycle?.turnRef)
    || normalizeOptionalTurnRef(overlayIntent?.turnRef)
    || normalizeOptionalTurnRef(visibleTurnLifecycle?.turnRef)
    || normalizeOptionalTurnRef(pendingTurn?.turnRef)
  );
}

function resolveChatPillViewIntent({
  currentTurnPresentationState,
  overlayIntent = null,
  pendingTurn = null,
  responseOverlayEntries,
  dismissedResponseId = null,
  visibleTurnLifecycle = null,
}: {
  currentTurnPresentationState: {
    activeResponse?: TurnRefMessage | null;
    visibleResponse?: TurnRefMessage | null;
    visibleTurnLifecycle?: {
      status?: string | null;
      turnRef?: string | null;
    } | null;
  };
  overlayIntent?: TurnRefSource;
  pendingTurn?: TurnRefSource;
  responseOverlayEntries: Array<{ id?: string | null }>;
  dismissedResponseId?: string | null;
  visibleTurnLifecycle?: TurnRefSource;
}) {
  const viewContract = resolveResponseOverlayViewContract({
    currentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId,
  });

  return {
    ...viewContract,
    turnId: resolveChatPillTurnId({
      currentTurnPresentationState,
      overlayIntent,
      pendingTurn,
      visibleTurnLifecycle,
    }),
  };
}

function buildChatPillLifecycleTraceSnapshot({
  chatSurfaceState = null,
  sessionConversationRef = null,
}: {
  chatSurfaceState?: ChatPillSurfaceState;
  sessionConversationRef?: string | null;
}) {
  const sdkLiveTurn = chatSurfaceState?.sdkLiveTurn ?? null;
  const candidateConversationView = chatSurfaceState?.conversationView ?? null;
  const conversationView = hasWorkspaceConversationView({ conversationView: candidateConversationView })
    ? candidateConversationView
    : null;
  const viewTurnRef = resolveViewLiveTurnRef(conversationView);
  const hasConversationView = Boolean(conversationView);
  return {
    conversationRef: normalizeOptionalString(sessionConversationRef),
    turnRef: hasConversationView
      ? viewTurnRef
      : resolveNoViewLiveTurnRef(sdkLiveTurn),
    phase: hasConversationView
      ? resolveViewLiveTurnPhase(conversationView)
      : resolveNoViewLiveTurnPhase(sdkLiveTurn),
  };
}

function buildChatPillLifecycleTraceValues({
  action,
  snapshot,
}: ChatPillLifecycleTraceValuesInput) {
  return {
    action,
    conversationRef: normalizeOptionalString(snapshot?.conversationRef),
    turnRef: normalizeOptionalTurnRef(snapshot?.turnRef),
    phase: normalizeOptionalString(snapshot?.phase),
  };
}

function buildChatPillResetTraceValues({
  attachmentCount = 0,
  includeQueryScreenshot = false,
  snapshot,
}: ChatPillResetTraceValuesInput) {
  return {
    conversationRef: normalizeOptionalString(snapshot?.conversationRef),
    previousTurnRef: normalizeOptionalTurnRef(snapshot?.turnRef),
    previousPhase: normalizeOptionalString(snapshot?.phase),
    attachmentCount,
    includeQueryScreenshot,
  };
}

function buildChatPillStateTraceSnapshot({
  busy,
  chatSurfaceState = null,
  sessionConversationRef = null,
  surfacePhase = null,
  surfaceSource = null,
  stopAvailable,
}: {
  busy: boolean;
  chatSurfaceState?: ChatPillSurfaceState;
  sessionConversationRef?: string | null;
  surfacePhase?: string | null;
  surfaceSource?: string | null;
  stopAvailable: boolean;
}) {
  const sdkLiveTurn = chatSurfaceState?.sdkLiveTurn ?? null;
  const candidateConversationView = chatSurfaceState?.conversationView ?? null;
  const conversationView = hasWorkspaceConversationView({ conversationView: candidateConversationView })
    ? candidateConversationView
    : null;
  const hasConversationView = Boolean(conversationView);
  const rendererFallbackMessages = hasConversationView
    ? []
    : Array.isArray(chatSurfaceState?.messages)
      ? chatSurfaceState.messages
      : [];
  const currentTurnPhase = hasConversationView
    ? resolveViewLiveTurnPhase(conversationView)
    : resolveNoViewLiveTurnPhase(sdkLiveTurn);
  const viewTurnRef = resolveViewLiveTurnRef(conversationView);
  const currentTurnRef = hasConversationView
    ? viewTurnRef
    : resolveNoViewLiveTurnRef(sdkLiveTurn);
  const viewPillMode = resolveViewPillMode(conversationView);
  const viewCanStop = resolveViewCanStop(conversationView);
  return {
    signature: JSON.stringify({
      busy,
      currentTurnPhase,
      currentTurnRef,
      liveTurnPhase: normalizeOptionalString(surfacePhase),
      liveTurnSource: normalizeOptionalString(surfaceSource),
      viewCanStop,
      viewPillMode,
      viewTurnRef,
    }),
    trace: {
      conversationRef: normalizeOptionalString(sessionConversationRef),
      turnRef: currentTurnRef,
      currentTurnPhase,
      liveTurnPhase: normalizeOptionalString(surfacePhase),
      liveTurnSource: normalizeOptionalString(surfaceSource),
      busy,
      stopAvailable,
      messageCount: rendererFallbackMessages.length,
    },
  };
}

export const DesktopChatPillSessionRuntime = Object.freeze({
  buildChatPillLifecycleTraceValues,
  buildChatPillLifecycleTraceSnapshot,
  buildChatPillResetTraceValues,
  buildChatPillStateTraceSnapshot,
  resolveChatPillSendLifecycle,
  resolveChatPillTurnId,
  resolveChatPillViewIntent,
});
