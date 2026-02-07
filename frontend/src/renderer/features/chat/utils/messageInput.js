export function normalizeMessageForSend(inputValue) {
  const trimmed = inputValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildOutgoingMessage(inputValue, isSending) {
  if (isSending) {
    return null;
  }

  return normalizeMessageForSend(inputValue);
}
