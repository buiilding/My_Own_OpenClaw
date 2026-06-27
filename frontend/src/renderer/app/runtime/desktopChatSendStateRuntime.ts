/**
 * Provides renderer chat send state predicates.
 */

import {
  DesktopConversationDisplayRowLookupRuntime,
} from './desktopConversationDisplayRowLookupRuntime';

const {
  hasConversationViewUserDisplayRows,
} = DesktopConversationDisplayRowLookupRuntime;

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

function isConversationView(value: ConversationViewState): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasPriorUserMessages({
  conversationView,
  messages,
}: PriorUserMessageState): boolean {
  if (isConversationView(conversationView)) {
    return hasConversationViewUserDisplayRows(conversationView);
  }
  return hasUserMessages(messages);
}

export const DesktopChatSendStateRuntime = Object.freeze({
  hasUserMessages,
  hasPriorUserMessages,
});
