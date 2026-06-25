/**
 * Provides renderer chat send state predicates.
 */

type SenderState = {
  sender?: string | null;
};

type ConversationViewDisplayRowState = {
  role?: string | null;
};

type ConversationViewState = {
  displayRows?: ConversationViewDisplayRowState[] | null;
} | null | undefined;

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

function hasConversationViewUserRows(conversationView: ConversationViewState): boolean {
  const displayRows = conversationView?.displayRows;
  if (!Array.isArray(displayRows)) {
    return false;
  }
  return displayRows.some((row) => row.role === 'user');
}

function hasPriorUserMessages({
  conversationView,
  messages,
}: PriorUserMessageState): boolean {
  if (Array.isArray(conversationView?.displayRows)) {
    return hasConversationViewUserRows(conversationView);
  }
  return hasUserMessages(messages);
}

export const DesktopChatSendStateRuntime = Object.freeze({
  hasUserMessages,
  hasPriorUserMessages,
});
