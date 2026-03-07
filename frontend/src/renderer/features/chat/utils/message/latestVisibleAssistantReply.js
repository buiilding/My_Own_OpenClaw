export function findLastUserIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender === 'user') {
      return index;
    }
  }
  return -1;
}

export function findLatestVisibleAssistantReply(messages, allowedTypes) {
  const lastUserIndex = findLastUserIndex(messages);
  const lowerBound = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;
  for (let index = messages.length - 1; index >= lowerBound; index -= 1) {
    const message = messages[index];
    if (message?.sender !== 'assistant') {
      continue;
    }
    if (!message?.text) {
      continue;
    }
    if (!allowedTypes.has(message.type)) {
      continue;
    }
    return message;
  }
  return null;
}
