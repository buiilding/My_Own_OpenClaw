export const CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT = 64;
const CHATBOX_VISUAL_ANCHOR_HEIGHT_WITH_PREVIEW = 116;

export function isDragBlockedTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(
    'button, a, [role="button"], input, textarea, select, option, label, [role="textbox"], [contenteditable=""], [contenteditable="true"], [contenteditable=true], .chatbox-input-wrap, .chatbox-actions',
  ));
}

export function resolveChatboxVisualAnchorHeight(hasImagePreview) {
  return hasImagePreview
    ? CHATBOX_VISUAL_ANCHOR_HEIGHT_WITH_PREVIEW
    : CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT;
}

export function createClipboardScreenshotImage({
  screenshot,
  contentType,
  extension,
  now = Date.now(),
}) {
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    base64: screenshot,
    contentType,
    filename: `screenshot-${now}.${extension}`,
    previewUrl: `data:${contentType};base64,${screenshot}`,
  };
}
