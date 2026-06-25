/**
 * Provides renderer message row class-name assembly for presentation surfaces.
 */

import { DesktopSdkDisplayAttachmentProjection } from './desktopSdkDisplayAttachmentProjection';

const {
  hasReadyDisplayImageAttachment,
} = DesktopSdkDisplayAttachmentProjection;

function hasVisualAttachment(message) {
  return hasReadyDisplayImageAttachment(message?.attachments);
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
    classNames.push('message-has-screenshot');
  }

  return classNames.join(' ');
}

export const DesktopMessageClassRuntime = Object.freeze({
  buildMessageClassName,
});
