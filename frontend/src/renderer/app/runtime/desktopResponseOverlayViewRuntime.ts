/**
 * Resolves response overlay view intent for renderer app-runtime consumers.
 */

import { DesktopResponseOverlayLayoutRuntime } from './desktopResponseOverlayLayoutRuntime';
import { isOverlayTurnLifecycleAwaiting } from './desktopOverlayTurnLifecycleRuntime';

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
    && isOverlayTurnLifecycleAwaiting(overlayTurnLifecycle)
    && visibleResponseId !== null
    && latestResponseOverlayEntryId === visibleResponseId
  );
  const showResponse = (
    responseOverlayEntries.length > 0
    && latestResponseOverlayEntryId !== dismissedResponseId
    && !isStaleVisibleResponseDuringAwaiting
  );
  const showAwaitingReply = !showResponse && awaitingReply;
  const overlayLayoutMode = DesktopResponseOverlayLayoutRuntime.resolveResponseOverlayLayoutMode({
    showResponse,
    showAwaitingReply,
  });

  return {
    latestResponseOverlayEntryId,
    showResponse,
    showAwaitingReply,
    overlayLayoutMode,
    isVisible: DesktopResponseOverlayLayoutRuntime.isVisibleResponseOverlayLayoutMode(
      overlayLayoutMode,
    ),
  };
}
