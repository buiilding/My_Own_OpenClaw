export function findLastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === 'user') {
      return i;
    }
  }
  return -1;
}

export function findLatestMessageAfterUser(messages, lastUserIndex, allowedTypes) {
  const lowerBound = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;
  for (let i = messages.length - 1; i >= lowerBound; i -= 1) {
    const message = messages[i];
    if (message.sender !== 'assistant') {
      continue;
    }
    if (!message.text) {
      continue;
    }
    if (!allowedTypes.has(message.type)) {
      continue;
    }
    return message;
  }
  return null;
}
