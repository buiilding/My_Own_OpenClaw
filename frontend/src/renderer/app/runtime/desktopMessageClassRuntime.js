/**
 * Provides renderer message row class-name assembly for presentation surfaces.
 */

import { DesktopSdkDisplayAttachmentProjection } from './desktopSdkDisplayAttachmentProjection';

const {
  readSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;

function hasVisualAttachment(message) {
  return readSdkDisplayAttachments(message?.attachments).length > 0;
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
