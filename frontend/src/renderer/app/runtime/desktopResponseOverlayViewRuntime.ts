/**
 * Resolves response overlay view intent for renderer runtime consumers.
 */

import {
  RESPONSE_OVERLAY_LAYOUT_MODE,
  resolveResponseOverlayLayoutMode,
} from './desktopResponseOverlayLayoutRuntime';
import { OVERLAY_TURN_LIFECYCLE } from './desktopOverlayTurnLifecycleRuntime';

type CurrentTurnPresentationStateLike = {
  showChatboxAwaitingReply?: boolean;
  overlayTurnLifecycle?: string;
  visibleResponse?: {
    id?: string | null;
  } | null;
};

type ResponseOverlayEntryLike = {
  id?: string | null;
};

export function resolveResponseOverlayViewContract({
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
  const awaitingReply = currentTurnPresentationState.showChatboxAwaitingReply === true;
  const overlayTurnLifecycle = currentTurnPresentationState.overlayTurnLifecycle;
  const visibleResponseId = currentTurnPresentationState.visibleResponse?.id || null;
  const isStaleVisibleResponseDuringAwaiting = (
    awaitingReply
    && (
      overlayTurnLifecycle === OVERLAY_TURN_LIFECYCLE.PREFLIGHT
      || overlayTurnLifecycle === OVERLAY_TURN_LIFECYCLE.AWAITING
    )
    && visibleResponseId !== null
    && latestResponseOverlayEntryId === visibleResponseId
  );
  const showResponse = (
    responseOverlayEntries.length > 0
    && latestResponseOverlayEntryId !== dismissedResponseId
    && !isStaleVisibleResponseDuringAwaiting
  );
  const showAwaitingReply = !showResponse && awaitingReply;
  const overlayLayoutMode = resolveResponseOverlayLayoutMode({
    showResponse,
    showAwaitingReply,
  });

  return {
    latestResponseOverlayEntryId,
    showResponse,
    showAwaitingReply,
    overlayLayoutMode,
    isVisible: overlayLayoutMode !== RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
  };
}
