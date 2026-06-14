/**
 * Provides the logging module for the renderer UI.
 */

import type { SurfaceMode, SurfacePhase, SurfaceTransitionSource } from './types';
import { nextTransitionSequence } from './state';
import { shouldLogSurfaceTransitions } from './loggingGate';

export function logSurfaceTransition(options: {
  source: SurfaceTransitionSource;
  correlationId: string;
  mode: SurfaceMode;
  phaseBefore: SurfacePhase;
  phaseAfter: SurfacePhase;
  attempt?: number;
  maxAttempts?: number;
  reason?: string | null;
}): void {
  if (!shouldLogSurfaceTransitions()) {
    return;
  }
  const base = {
    sequence: nextTransitionSequence(),
    source: options.source,
    correlation_id: options.correlationId,
    mode: options.mode,
    phase_before: options.phaseBefore,
    phase_after: options.phaseAfter,
  } as Record<string, unknown>;

  if (typeof options.attempt === 'number') {
    base.attempt = options.attempt;
  }
  if (typeof options.maxAttempts === 'number') {
    base.max_attempts = options.maxAttempts;
  }
  if (typeof options.reason === 'string' && options.reason.length > 0) {
    base.reason = options.reason;
  }

  console.log('[SurfaceOrchestrator] transition', base);
}
