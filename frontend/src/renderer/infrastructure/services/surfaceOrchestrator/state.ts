/**
 * Provides the state module for the renderer UI.
 */

import type { HiddenSurface } from './types';

type SurfaceOrchestratorState = {
  nextSurfaceToken: number;
  activeSurfaceTokens: Set<number>;
  pendingHiddenSurfaceRestore: HiddenSurface | null;
  transitionLogSequence: number;
  nextSyntheticCorrelationId: number;
};

const state: SurfaceOrchestratorState = {
  nextSurfaceToken: 1,
  activeSurfaceTokens: new Set<number>(),
  pendingHiddenSurfaceRestore: null,
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

export function setPendingHiddenSurfaceRestore(hiddenSurface: HiddenSurface | null): void {
  state.pendingHiddenSurfaceRestore = hiddenSurface && hiddenSurface !== 'none'
    ? hiddenSurface
    : null;
}

export function getPendingHiddenSurfaceRestore(): HiddenSurface | null {
  return state.pendingHiddenSurfaceRestore;
}

export function isPendingHiddenSurfaceRestore(): boolean {
  return state.pendingHiddenSurfaceRestore !== null;
}
