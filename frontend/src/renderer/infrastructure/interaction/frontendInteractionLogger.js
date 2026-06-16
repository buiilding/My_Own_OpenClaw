/**
 * Provides the frontend interaction logger module for the renderer UI.
 */

import { IpcBridge, SEND_CHANNELS } from '../ipc/bridge';

const MAX_LABEL_LENGTH = 120;
const MESSAGE_TEXT_REDACTION = '[redacted]';
const INTERACTION_SCHEMA_VERSION = 1;

let installedCleanup = null;

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
}

function getRendererView() {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const params = new URLSearchParams(window.location?.search || '');
  return params.get('view') || 'main';
}

function getClassList(element) {
  if (!element?.classList) {
    return [];
  }
  return Array.from(element.classList).filter(Boolean);
}

function readFormLabel(element) {
  const labels = Array.from(element?.labels || []);
  const label = labels
    .map((item) => normalizeText(item.textContent || ''))
    .find(Boolean);
  if (label) {
    return label;
  }

  const labelledBy = element?.getAttribute?.('aria-labelledby');
  if (!labelledBy || typeof document === 'undefined') {
    return '';
  }
  return labelledBy
    .split(/\s+/)
    .map((id) => normalizeText(document.getElementById(id)?.textContent || ''))
    .find(Boolean) || '';
}

function readElementLabel(element) {
  if (!element) {
    return '';
  }
  const tagName = element.tagName?.toLowerCase();
  const inputType = element.getAttribute?.('type') || '';
  const inputButtonValue = (
    tagName === 'input'
    && ['button', 'submit', 'reset'].includes(inputType.toLowerCase())
      ? normalizeText(element.getAttribute('value') || '')
      : ''
  );
  const candidates = [
    element.getAttribute?.('data-interaction-label'),
    element.getAttribute?.('aria-label'),
    element.getAttribute?.('title'),
    readFormLabel(element),
    inputButtonValue,
    element.getAttribute?.('placeholder'),
    element.textContent,
    element.getAttribute?.('data-testid'),
    element.id,
  ];
  return candidates.map(normalizeText).find(Boolean) || tagName || 'unknown';
}

function findInteractionElement(target) {
  if (!target || typeof target.closest !== 'function') {
    return null;
  }
  return target.closest([
    '[data-interaction-label]',
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[data-testid]',
  ].join(','));
}

function classifyClickAction(element, label) {
  const classList = getClassList(element);
  const normalizedLabel = label.toLowerCase();
  if (classList.includes('cg-chat-item') && !classList.includes('cg-chat-item-menu-trigger')) {
    return 'chat_clicked';
  }
  if (normalizedLabel === 'settings' || normalizedLabel.includes('settings')) {
    return 'settings_button_clicked';
  }
  if (element?.tagName?.toLowerCase() === 'button' || element?.getAttribute?.('role') === 'button') {
    return 'button_clicked';
  }
  if (element?.tagName?.toLowerCase() === 'a') {
    return 'link_clicked';
  }
  return 'element_clicked';
}

function describeInteractionTarget(target) {
  const element = findInteractionElement(target);
  if (!element) {
    return null;
  }
  const label = readElementLabel(element);
  const classList = getClassList(element);
  const tagName = element.tagName?.toLowerCase() || 'unknown';
  return {
    element,
    label,
    tagName,
    role: element.getAttribute?.('role') || null,
    type: element.getAttribute?.('type') || null,
    testId: element.getAttribute?.('data-testid') || null,
    className: classList.join(' ') || null,
  };
}

function isExplicitMessageTextDiagnosticEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.__WINDIE_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__ === true) {
    return true;
  }
  const params = new URLSearchParams(window.location?.search || '');
  return (
    params.get('debug_interaction_message_text') === '1'
    || params.get('debug_message_text') === '1'
  );
}

function normalizeInteractionDetails(details = {}, {
  includeMessageText = isExplicitMessageTextDiagnosticEnabled(),
} = {}) {
  const source = (
    details
    && typeof details === 'object'
    && !Array.isArray(details)
  ) ? details : {};
  const normalized = { ...source };

  if (Object.prototype.hasOwnProperty.call(normalized, 'messageText')) {
    const rawMessageText = typeof normalized.messageText === 'string'
      ? normalized.messageText
      : '';
    normalized.messageTextLength = typeof normalized.textLength === 'number'
      ? normalized.textLength
      : rawMessageText.length;
    if (!includeMessageText) {
      normalized.messageText = MESSAGE_TEXT_REDACTION;
      normalized.messageTextRedacted = true;
    } else {
      normalized.messageTextRedacted = false;
    }
  }

  return normalized;
}

function createFrontendInteractionEntry(action, details = {}, options = {}) {
  return {
    schemaVersion: INTERACTION_SCHEMA_VERSION,
    source: 'frontend-interaction',
    action,
    view: getRendererView(),
    timestamp: new Date().toISOString(),
    ...normalizeInteractionDetails(details, options),
  };
}

function compactInteractionValue(value, maxLength = 80) {
  if (typeof value !== 'string') {
    return '-';
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '-';
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function formatFrontendInteractionSummary(entry = {}) {
  const target = entry.target && typeof entry.target === 'object' && !Array.isArray(entry.target)
    ? entry.target
    : {};
  return [
    `action=${compactInteractionValue(entry.action, 48)}`,
    `event=${compactInteractionValue(entry.event, 32)}`,
    `view=${compactInteractionValue(entry.view, 48)}`,
    `label=${JSON.stringify(compactInteractionValue(target.label, 64))}`,
    `target=${compactInteractionValue(target.tagName, 24)}`,
  ].join(' ');
}

function logFrontendInteraction(action, details = {}) {
  const payload = createFrontendInteractionEntry(action, details);
  if (window.__WINDIE_DEBUG_SURFACE_STDOUT__ === true) {
    console.log(`[FrontendInteraction] ${formatFrontendInteractionSummary(payload)}`);
  }
  try {
    IpcBridge.send(SEND_CHANNELS.RENDERER_LOG, {
      source: 'frontend-interaction',
      entry: payload,
    });
  } catch (_error) {
    // DevTools logging still works when preload IPC is unavailable in tests or browser-only renders.
  }
}

function handleClick(event) {
  const description = describeInteractionTarget(event.target);
  if (!description) {
    return;
  }
  const { element, ...target } = description;
  const action = classifyClickAction(element, target.label);
  logFrontendInteraction(action, {
    event: 'click',
    target,
  });
}

function handleChange(event) {
  const description = describeInteractionTarget(event.target);
  if (!description) {
    return;
  }
  const { element, ...target } = description;
  const inputType = element.getAttribute?.('type') || null;
  const checked = inputType === 'checkbox' || inputType === 'radio'
    ? element.checked === true
    : undefined;
  logFrontendInteraction('control_changed', {
    event: 'change',
    target,
    checked,
  });
}

export function logUserSentMessage({
  conversationRef = null,
  senderSurface = null,
  messageText = '',
  textLength = 0,
  attachmentCount = 0,
  imageCount = 0,
  readableFileCount = 0,
} = {}) {
  logFrontendInteraction('message_sent', {
    event: 'send-message',
    conversationRef,
    senderSurface,
    messageText,
    textLength,
    attachmentCount,
    imageCount,
    readableFileCount,
  });
}

export function installFrontendInteractionLogger() {
  if (installedCleanup || typeof document === 'undefined') {
    return installedCleanup || (() => {});
  }
  document.addEventListener('click', handleClick, true);
  document.addEventListener('change', handleChange, true);
  installedCleanup = () => {
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('change', handleChange, true);
    installedCleanup = null;
  };
  return installedCleanup;
}
