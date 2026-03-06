export function isStaleTurnForActiveStream(
  eventTurnRef: string | null | undefined,
  activeTurnRef: string | null | undefined,
): boolean {
  const normalizedEventTurnRef = (
    typeof eventTurnRef === 'string'
      ? eventTurnRef.trim()
      : ''
  );
  const normalizedActiveTurnRef = (
    typeof activeTurnRef === 'string'
      ? activeTurnRef.trim()
      : ''
  );
  if (!normalizedEventTurnRef || !normalizedActiveTurnRef) {
    return false;
  }
  return normalizedActiveTurnRef !== normalizedEventTurnRef;
}
