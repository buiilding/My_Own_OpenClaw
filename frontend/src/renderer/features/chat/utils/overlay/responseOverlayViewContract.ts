import { RESPONSE_OVERLAY_LAYOUT_MODE, resolveResponseOverlayLayoutMode } from './responseOverlayLayoutMode';

type CurrentTurnPresentationStateLike = {
  showChatboxAwaitingReply?: boolean;
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
  const showResponse = responseOverlayEntries.length > 0 && latestResponseOverlayEntryId !== dismissedResponseId;
  const showAwaitingReply = !showResponse && currentTurnPresentationState.showChatboxAwaitingReply === true;
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
