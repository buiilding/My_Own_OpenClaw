/**
 * Provides renderer message row class-name assembly for presentation surfaces.
 */

function hasVisualAttachment(message) {
  return Array.isArray(message?.attachments)
    && message.attachments.some((attachment) => (
      attachment
      && typeof attachment === 'object'
      && attachment.kind === 'image'
      && attachment.status === 'ready'
      && (
        typeof attachment.screenshotRef === 'string'
        || typeof attachment.screenshotUrl === 'string'
      )
    ));
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
