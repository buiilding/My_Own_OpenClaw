/**
 * Provides renderer chat send state predicates.
 */

type SenderState = {
  sender?: string | null;
};

export function hasUserMessages(messages: SenderState[]): boolean {
  return messages.some((message) => message.sender === 'user');
}
