export function getLatestAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.sender === 'assistant' && message.type !== 'tool-output' && message.text) {
      return message.text;
    }
  }
  return null;
}

export function trimPreview(text, maxLength) {
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

export function getChatBoxStatusText(thinkingStatus, isSending) {
  if (thinkingStatus) {
    return 'Thinking…';
  }
  if (isSending) {
    return 'Sending…';
  }
  return 'Ready';
}

export function getInteractionModeLabel(interactionMode) {
  return interactionMode === 'agent' ? 'Agent' : 'Chat';
}
