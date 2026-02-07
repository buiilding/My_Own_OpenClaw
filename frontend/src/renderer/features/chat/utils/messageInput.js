export function normalizeMessageForSend(inputValue) {
  const trimmed = inputValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}
