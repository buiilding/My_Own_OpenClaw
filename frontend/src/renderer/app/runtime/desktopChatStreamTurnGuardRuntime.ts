/**
 * Coordinates the desktop chat stream turn guard runtime for the renderer UI.
 */

function isStaleTurnForActiveStream(
  eventTurnRef: string | null | undefined,
  activeTurnRef: string | null | undefined,
): boolean {
  const normalizedEventTurnRef = (
    typeof eventTurnRef === 'string'
      && eventTurnRef.length > 0
      && eventTurnRef === eventTurnRef.trim()
      ? eventTurnRef
      : ''
  );
  const normalizedActiveTurnRef = (
    typeof activeTurnRef === 'string'
      && activeTurnRef.length > 0
      && activeTurnRef === activeTurnRef.trim()
      ? activeTurnRef
      : ''
  );
  if (!normalizedEventTurnRef || !normalizedActiveTurnRef) {
    return false;
  }
  return normalizedActiveTurnRef !== normalizedEventTurnRef;
}

export const DesktopChatStreamTurnGuardRuntime = Object.freeze({
  isStaleTurnForActiveStream,
});
