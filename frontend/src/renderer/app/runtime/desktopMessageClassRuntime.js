/**
 * Provides renderer message row class-name assembly for presentation surfaces.
 */

import { DesktopMessageAttachmentPresentationRuntime } from './desktopMessageAttachmentPresentationRuntime';

function hasVisualAttachment(message) {
  return DesktopMessageAttachmentPresentationRuntime.hasVisibleSdkDisplayAttachments(message);
}

function buildMessageClassName(message) {
  const classNames = ['message', `message-${message.sender}`];

  if (message.sender === 'assistant' && message.isComplete === false) {
    classNames.push('message-streaming');
  }

  if (message.type) {
    classNames.push(`message-type-${message.type}`);
  }

  if (hasVisualAttachment(message)) {
    classNames.push('message-has-attachment');
  }

  return classNames.join(' ');
}

export const DesktopMessageClassRuntime = Object.freeze({
  buildMessageClassName,
});
