/**
 * Owns dashboard conversation browser-dialog adapters for renderer app runtime.
 */

import { DesktopDashboardConversationLoadRuntime } from './desktopDashboardConversationLoadRuntime';

const {
  getDashboardConversationRenamePromptValue,
} = DesktopDashboardConversationLoadRuntime;

const RENAME_CONVERSATION_PROMPT_TITLE = 'Rename chat';
const DELETE_CONVERSATION_CONFIRM_MESSAGE = 'Delete this chat? This cannot be undone.';

function getDialogHost() {
  return globalThis.window || null;
}

function requestDashboardConversationRenameTitle(conversation) {
  const host = getDialogHost();
  if (!host || typeof host.prompt !== 'function') {
    return null;
  }
  const currentTitle = getDashboardConversationRenamePromptValue(conversation, '');
  const nextTitleInput = host.prompt(
    RENAME_CONVERSATION_PROMPT_TITLE,
    getDashboardConversationRenamePromptValue(conversation),
  );
  if (typeof nextTitleInput !== 'string') {
    return null;
  }
  const nextTitle = nextTitleInput.trim();
  if (!nextTitle || nextTitle === currentTitle) {
    return null;
  }
  return nextTitle;
}

function confirmDashboardConversationDelete() {
  const host = getDialogHost();
  return Boolean(
    host
      && typeof host.confirm === 'function'
      && host.confirm(DELETE_CONVERSATION_CONFIRM_MESSAGE) === true,
  );
}

export const DesktopDashboardConversationDialogRuntime = Object.freeze({
  confirmDashboardConversationDelete,
  requestDashboardConversationRenameTitle,
});
