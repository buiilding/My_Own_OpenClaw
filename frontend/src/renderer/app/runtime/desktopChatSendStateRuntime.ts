/**
 * Provides renderer chat send state predicates.
 */

type SenderState = {
  sender?: string | null;
};

function hasUserMessages(messages: SenderState[]): boolean {
  return messages.some((message) => message.sender === 'user');
}

export const DesktopChatSendStateRuntime = Object.freeze({
  hasUserMessages,
});
