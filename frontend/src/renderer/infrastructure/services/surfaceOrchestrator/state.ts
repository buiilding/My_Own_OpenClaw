type SurfaceOrchestratorState = {
  nextSurfaceToken: number;
  activeSurfaceTokens: Set<number>;
  activeOverlayIgnoreTokens: Set<number>;
  activeOverlayNonFocusableTokens: Set<number>;
  pendingChatPillRestore: boolean;
  activeScreenshotCaptureCount: number;
  pendingScreenshotCaptureRestore: boolean;
  transitionLogSequence: number;
  nextSyntheticCorrelationId: number;
};

const state: SurfaceOrchestratorState = {
  nextSurfaceToken: 1,
  activeSurfaceTokens: new Set<number>(),
  activeOverlayIgnoreTokens: new Set<number>(),
  activeOverlayNonFocusableTokens: new Set<number>(),
  pendingChatPillRestore: false,
  activeScreenshotCaptureCount: 0,
  pendingScreenshotCaptureRestore: false,
  transitionLogSequence: 0,
  nextSyntheticCorrelationId: 1,
};

export function resolveCorrelationId(correlationId: string | null | undefined, fallbackPrefix: string): string {
  if (typeof correlationId === 'string' && correlationId.trim().length > 0) {
    return correlationId.trim();
  }
  const syntheticCorrelationId = `${fallbackPrefix}-${state.nextSyntheticCorrelationId}`;
  state.nextSyntheticCorrelationId += 1;
  return syntheticCorrelationId;
}

export function nextTransitionSequence(): number {
  state.transitionLogSequence += 1;
  return state.transitionLogSequence;
}

export function registerSurfaceToken(): number {
  const token = state.nextSurfaceToken;
  state.nextSurfaceToken += 1;
  state.activeSurfaceTokens.add(token);
  return token;
}

export function hasActiveSurfaceTokens(): boolean {
  return state.activeSurfaceTokens.size > 0;
}

export function releaseSurfaceToken(surfaceToken: number | null): boolean {
  if (typeof surfaceToken !== 'number') {
    return false;
  }
  if (!state.activeSurfaceTokens.has(surfaceToken)) {
    return false;
  }
  state.activeSurfaceTokens.delete(surfaceToken);
  return state.activeSurfaceTokens.size === 0;
}

export function markOverlayIgnoreForToken(surfaceToken: number | null): void {
  if (typeof surfaceToken !== 'number') {
    return;
  }
  state.activeOverlayIgnoreTokens.add(surfaceToken);
}

export function unmarkOverlayIgnoreForToken(surfaceToken: number | null): boolean {
  if (typeof surfaceToken !== 'number') {
    return false;
  }
  if (!state.activeOverlayIgnoreTokens.has(surfaceToken)) {
    return false;
  }
  state.activeOverlayIgnoreTokens.delete(surfaceToken);
  return state.activeOverlayIgnoreTokens.size === 0;
}

export function markOverlayNonFocusableForToken(surfaceToken: number | null): void {
  if (typeof surfaceToken !== 'number') {
    return;
  }
  state.activeOverlayNonFocusableTokens.add(surfaceToken);
}

export function unmarkOverlayNonFocusableForToken(surfaceToken: number | null): boolean {
  if (typeof surfaceToken !== 'number') {
    return false;
  }
  if (!state.activeOverlayNonFocusableTokens.has(surfaceToken)) {
    return false;
  }
  state.activeOverlayNonFocusableTokens.delete(surfaceToken);
  return state.activeOverlayNonFocusableTokens.size === 0;
}

export function setPendingChatPillRestore(pending: boolean): void {
  state.pendingChatPillRestore = pending;
}

export function isPendingChatPillRestore(): boolean {
  return state.pendingChatPillRestore;
}

export function incrementActiveScreenshotCaptureCount(): number {
  state.activeScreenshotCaptureCount += 1;
  return state.activeScreenshotCaptureCount;
}

export function decrementActiveScreenshotCaptureCount(): number {
  state.activeScreenshotCaptureCount = Math.max(0, state.activeScreenshotCaptureCount - 1);
  return state.activeScreenshotCaptureCount;
}

export function getActiveScreenshotCaptureCount(): number {
  return state.activeScreenshotCaptureCount;
}

export function setPendingScreenshotCaptureRestore(pending: boolean): void {
  state.pendingScreenshotCaptureRestore = pending;
}

export function isPendingScreenshotCaptureRestore(): boolean {
  return state.pendingScreenshotCaptureRestore;
}

export function resetSurfaceOrchestratorStateForTests(): void {
  state.activeSurfaceTokens.clear();
  state.activeOverlayIgnoreTokens.clear();
  state.activeOverlayNonFocusableTokens.clear();
  state.nextSurfaceToken = 1;
  state.pendingChatPillRestore = false;
  state.activeScreenshotCaptureCount = 0;
  state.pendingScreenshotCaptureRestore = false;
  state.transitionLogSequence = 0;
  state.nextSyntheticCorrelationId = 1;
}
