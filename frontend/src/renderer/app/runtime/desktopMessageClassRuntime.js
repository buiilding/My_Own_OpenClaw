/**
 * Provides renderer message row class-name assembly for presentation surfaces.
 */

import { hasMessageScreenshot } from './desktopMessageScreenshotRuntime';

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
