/**
 * Resolves chat-pill send lifecycle and response overlay view intent.
 */

import {
  DesktopMessageSendUiRuntime,
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from './desktopMessageSendUiRuntime';
import { DesktopResponseOverlayViewRuntime } from './desktopResponseOverlayViewRuntime';

const {
  resolveMessageSendUiBehavior,
} = DesktopMessageSendUiRuntime;
const {
  resolveResponseOverlayViewContract,
} = DesktopResponseOverlayViewRuntime;

type TurnRefMessage = {
  id?: string | null;
  turnRef?: string | null;
};

type ChatPillCurrentTurnProjection = {
  phase?: string | null;
  turnRef?: string | null;
} | null | undefined;

type ChatPillConversationView = {
  liveTurn?: {
    canStop?: boolean | null;
    phase?: string | null;
    turnRef?: string | null;
  } | null;
  surfaces?: {
    pill?: {
      mode?: string | null;
    } | null;
  } | null;
} | null | undefined;

type ChatPillSurfaceState = {
  conversationView?: ChatPillConversationView;
  currentTurnProjection?: ChatPillCurrentTurnProjection;
  messages?: unknown[] | null;
} | null | undefined;

const CHAT_PILL_SURFACE_REASON = Object.freeze({
  QUERY_SEND_WITH_CAPTURE: 'query_send_with_capture',
  QUERY_SEND_WITHOUT_CAPTURE: 'query_send_without_capture',
  TOOL_INTERACTIVE: 'tool_interactive',
  TOOL_SCREENSHOT: 'tool_screenshot',
});

function normalizeOptionalTurnRef(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function findLatestChatTurnId(messages: TurnRefMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const turnRef = normalizeOptionalTurnRef(messages[index]?.turnRef);
    if (turnRef) {
      return turnRef;
    }
  }
  return null;
}

function resolveViewLiveTurnRef(conversationView: ChatPillConversationView): string | null {
  return normalizeOptionalTurnRef(conversationView?.liveTurn?.turnRef);
}

function resolveViewLiveTurnPhase(conversationView: ChatPillConversationView): string | null {
  return normalizeOptionalString(conversationView?.liveTurn?.phase);
}

function resolveViewPillMode(conversationView: ChatPillConversationView): string | null {
  return normalizeOptionalString(conversationView?.surfaces?.pill?.mode);
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

function resolveChatPillViewIntent({
  messages,
  currentTurnPresentationState,
  responseOverlayEntries,
  dismissedResponseId = null,
}: {
  messages: TurnRefMessage[];
  currentTurnPresentationState: {
    activeResponse?: TurnRefMessage | null;
    visibleResponse?: TurnRefMessage | null;
    visibleTurnLifecycle?: {
      status?: string | null;
    } | null;
  };
  responseOverlayEntries: Array<{ id?: string | null }>;
  dismissedResponseId?: string | null;
}) {
  const viewContract = resolveResponseOverlayViewContract({
    currentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId,
  });

  return {
    ...viewContract,
    turnId: (
      normalizeOptionalTurnRef(currentTurnPresentationState.visibleResponse?.turnRef)
      || normalizeOptionalTurnRef(currentTurnPresentationState.activeResponse?.turnRef)
      || findLatestChatTurnId(messages)
    ),
  };
}

function buildChatPillLifecycleTraceSnapshot({
  chatSurfaceState = null,
  sessionConversationRef = null,
}: {
  chatSurfaceState?: ChatPillSurfaceState;
  sessionConversationRef?: string | null;
}) {
  const currentTurnProjection = chatSurfaceState?.currentTurnProjection ?? null;
  const conversationView = chatSurfaceState?.conversationView ?? null;
  const viewTurnRef = resolveViewLiveTurnRef(conversationView);
  const hasConversationView = Boolean(conversationView && typeof conversationView === 'object');
  return {
    conversationRef: normalizeOptionalString(sessionConversationRef),
    turnRef: viewTurnRef || normalizeOptionalTurnRef(currentTurnProjection?.turnRef),
    phase: hasConversationView
      ? resolveViewLiveTurnPhase(conversationView)
      : normalizeOptionalString(currentTurnProjection?.phase),
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
  const currentTurnProjection = chatSurfaceState?.currentTurnProjection ?? null;
  const conversationView = chatSurfaceState?.conversationView ?? null;
  const hasConversationView = Boolean(conversationView && typeof conversationView === 'object');
  const currentTurnPhase = hasConversationView
    ? resolveViewLiveTurnPhase(conversationView)
    : normalizeOptionalString(currentTurnProjection?.phase);
  const viewTurnRef = resolveViewLiveTurnRef(conversationView);
  const currentTurnRef = viewTurnRef || normalizeOptionalTurnRef(currentTurnProjection?.turnRef);
  const viewPillMode = resolveViewPillMode(conversationView);
  const viewCanStop = conversationView?.liveTurn?.canStop === true;
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
      messageCount: Array.isArray(chatSurfaceState?.messages)
        ? chatSurfaceState.messages.length
        : 0,
    },
  };
}

export const DesktopChatPillSessionRuntime = Object.freeze({
  buildChatPillLifecycleTraceSnapshot,
  buildChatPillStateTraceSnapshot,
  resolveChatPillSendLifecycle,
  resolveChatPillViewIntent,
});
