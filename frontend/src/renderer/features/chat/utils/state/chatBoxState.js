export const CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT = 64;
const CHATBOX_VISUAL_ANCHOR_HEIGHT_PADDING = 8;

export function resolveChatboxVisualAnchorHeight(measuredComposerHeight) {
  const roundedHeight = Math.round(Number(measuredComposerHeight) || 0);
  if (roundedHeight <= 0) {
    return CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT;
  }
  return Math.max(
    CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT,
    roundedHeight + CHATBOX_VISUAL_ANCHOR_HEIGHT_PADDING,
  );
}
