/**
 * Resolves chat-pill send lifecycle and response overlay view intent.
 */

import {
  resolveMessageSendUiBehavior,
  type ChatSendSurface,
  type ReturnToChatboxPolicy,
} from './desktopMessageSendUiRuntime';
import { resolveResponseOverlayViewContract } from './desktopResponseOverlayViewRuntime';

type TurnRefMessage = {
  turnRef?: string | null;
};

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

function findLatestChatTurnId(messages: TurnRefMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const turnRef = normalizeOptionalTurnRef(messages[index]?.turnRef);
    if (turnRef) {
      return turnRef;
    }
  }
  return null;
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
    showChatboxAwaitingReply?: boolean;
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

export const DesktopChatPillSessionRuntime = Object.freeze({
  resolveChatPillSendLifecycle,
  resolveChatPillViewIntent,
});
