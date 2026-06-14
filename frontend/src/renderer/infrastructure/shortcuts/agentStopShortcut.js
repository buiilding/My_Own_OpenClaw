/**
 * Provides the agent stop shortcut module for the renderer UI.
 */

import shortcutCatalog from '../../../shared/agent_stop_shortcut_catalog.json';

export function getAgentStopShortcutLabel() {
  return 'Esc';
}

function getRendererPlatformLabel() {
  if (typeof navigator !== 'object' || navigator == null) {
    return '';
  }
  const userAgentDataPlatform = navigator.userAgentData?.platform;
  if (typeof userAgentDataPlatform === 'string' && userAgentDataPlatform.trim()) {
    return userAgentDataPlatform;
  }
  const navigatorPlatform = navigator.platform;
  if (typeof navigatorPlatform === 'string' && navigatorPlatform.trim()) {
    return navigatorPlatform;
  }
  return '';
}

function resolveRendererShortcutPlatformKey() {
  const platformLabel = getRendererPlatformLabel();
  if (/mac/i.test(platformLabel)) {
    return 'darwin';
  }
  if (/win/i.test(platformLabel)) {
    return 'win32';
  }
  return 'linux';
}

export function getGlobalAgentStopShortcutOptions() {
  return shortcutCatalog[resolveRendererShortcutPlatformKey()] || shortcutCatalog.linux;
}

export function normalizeGlobalAgentStopShortcutAccelerator(accelerator) {
  const shortcuts = getGlobalAgentStopShortcutOptions();
  const normalizedAccelerator = typeof accelerator === 'string' ? accelerator.trim() : '';
  const matchedShortcut = shortcuts.find((shortcut) => shortcut.accelerator === normalizedAccelerator);
  return matchedShortcut?.accelerator || shortcuts[0]?.accelerator || 'CommandOrControl+Shift+Escape';
}

export function getGlobalAgentStopShortcutLabel(accelerator = null) {
  const normalizedAccelerator = normalizeGlobalAgentStopShortcutAccelerator(accelerator);
  return (
    getGlobalAgentStopShortcutOptions().find(
      (shortcut) => shortcut.accelerator === normalizedAccelerator,
    )?.label || getGlobalAgentStopShortcutOptions()[0]?.label || 'Ctrl + Shift + Esc'
  );
}

export function isAgentStopShortcutEvent(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }
  if (event.repeat) {
    return false;
  }
  const key = String(event.key || '');
  const normalizedKey = key.toLowerCase();
  if (normalizedKey !== 'escape' && normalizedKey !== 'esc') {
    return false;
  }
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}
