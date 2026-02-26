export function findLastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === 'user') {
      return i;
    }
  }
  return -1;
}

export function findLatestMessageAfterUser(messages, lastUserIndex, allowedTypes) {
  if (lastUserIndex < 0) {
    return null;
  }
  for (let i = messages.length - 1; i > lastUserIndex; i -= 1) {
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
