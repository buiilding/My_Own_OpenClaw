/**
 * Provides renderer chat send state predicates.
 */

import {
  DesktopConversationDisplayRowLookupRuntime,
} from './desktopConversationDisplayRowLookupRuntime';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

const {
  hasConversationViewUserDisplayRows,
} = DesktopConversationDisplayRowLookupRuntime;
const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

type SenderState = {
  sender?: string | null;
};

type ConversationViewState = unknown;

type PriorUserMessageState = {
  conversationView?: ConversationViewState;
  messages?: SenderState[] | null;
};

function hasUserMessages(messages: SenderState[] | null | undefined): boolean {
  if (!Array.isArray(messages)) {
    return false;
  }
  return messages.some((message) => message.sender === 'user');
}

function hasPriorUserMessages({
  conversationView,
  messages,
}: PriorUserMessageState): boolean {
  const workspace = { conversationView };
  if (hasWorkspaceConversationView(workspace)) {
    return hasConversationViewUserDisplayRows(workspace.conversationView);
  }
  return hasUserMessages(messages);
}

export const DesktopChatSendStateRuntime = Object.freeze({
  hasUserMessages,
  hasPriorUserMessages,
});
