/**
 * Provides the message list classes module for the renderer UI.
 */

import { hasMessageScreenshot } from './messageScreenshots';

export function buildMessageClassName(message) {
  const classNames = ['message', `message-${message.sender}`];

  if (message.sender === 'assistant' && message.isComplete === false) {
    classNames.push('message-streaming');
  }

  if (message.type) {
    classNames.push(`message-type-${message.type}`);
  }

  if (hasMessageScreenshot(message)) {
    classNames.push('message-has-screenshot');
  }

  return classNames.join(' ');
}
