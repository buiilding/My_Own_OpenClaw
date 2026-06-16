/**
 * Provides the capture lifecycle module for the renderer UI.
 */

import { logSurfaceTransition } from './logging';
import {
  resolveSurfaceTransitionContext,
} from './context';
import {
  SURFACE_REASON_NO_TRANSITION_NEEDED,
} from './reasons';
import {
  SURFACE_PHASE,
  type SurfaceTransitionSource,
} from './types';

export async function prepareExternalFocusForCapture(
  options: {
    captureId?: string | null;
    waitMs?: number;
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const context = resolveSurfaceTransitionContext(
    options.source,
    options.captureId,
    'system-capture',
    'capture-focus',
  );
  const source = context.source;
  const captureId = context.correlationId;
  logSurfaceTransition({
    source,
    correlationId: captureId,
    mode: 'screenshot',
    phaseBefore: SURFACE_PHASE.CAPTURE_READY,
    phaseAfter: SURFACE_PHASE.CAPTURE_READY,
    reason: SURFACE_REASON_NO_TRANSITION_NEEDED,
  });
}
