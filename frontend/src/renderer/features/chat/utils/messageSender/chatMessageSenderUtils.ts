/**
 * Provides the chat message sender utils module for the renderer UI.
 */

import type { ChatMessage } from '../../stores/chatStore';

export function hasUserMessages(messages: Pick<ChatMessage, 'sender'>[]): boolean {
  return messages.some((message) => message.sender === 'user');
}
