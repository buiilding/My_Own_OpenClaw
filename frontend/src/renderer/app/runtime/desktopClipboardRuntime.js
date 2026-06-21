/**
 * Provides renderer clipboard browser adapters behind the app runtime boundary.
 */

function resolveClipboard(options = {}) {
  if (options.clipboard) {
    return options.clipboard;
  }
  return globalThis.navigator?.clipboard || null;
}

async function writeText(text, options = {}) {
  const normalizedText = typeof text === 'string' ? text : String(text ?? '');
  if (!normalizedText) {
    return false;
  }

  const clipboard = resolveClipboard(options);
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    throw new Error('Clipboard writeText is unavailable');
  }

  await clipboard.writeText(normalizedText);
  return true;
}

export const DesktopClipboardRuntime = Object.freeze({
  writeText,
});
