export function isStaleTurnForActiveStream(
  eventTurnRef: string | null | undefined,
  activeTurnRef: string | null | undefined,
): boolean {
  if (!eventTurnRef || !activeTurnRef) {
    return false;
  }
  return activeTurnRef !== eventTurnRef;
}

