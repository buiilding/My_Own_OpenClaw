/**
 * Provides the chat box state module for the renderer UI.
 */

export const CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT = 64;
export const CHATBOX_WINDOW_FRAME_HEIGHT_PADDING = 6;
const CHATBOX_VISUAL_ANCHOR_HEIGHT_WITH_PREVIEW = 116;

export function resolveChatboxVisualAnchorHeight({
  hasImagePreview = false,
  shellHeight = null,
} = {}) {
  const measuredShellHeight = Math.round(Number(shellHeight));
  if (Number.isFinite(measuredShellHeight) && measuredShellHeight > CHATBOX_WINDOW_FRAME_HEIGHT_PADDING) {
    return measuredShellHeight - CHATBOX_WINDOW_FRAME_HEIGHT_PADDING;
  }

  return hasImagePreview
    ? CHATBOX_VISUAL_ANCHOR_HEIGHT_WITH_PREVIEW
    : CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT;
}
