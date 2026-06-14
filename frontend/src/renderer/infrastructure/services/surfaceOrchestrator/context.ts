/**
 * Provides the context module for the renderer UI.
 */

import { resolveCorrelationId } from './state';
import { type SurfaceTransitionSource } from './types';

export function resolveSurfaceTransitionContext(
  source: SurfaceTransitionSource | null | undefined,
  correlationId: string | null | undefined,
  defaultSource: SurfaceTransitionSource,
  fallbackCorrelationPrefix: string,
): {
  source: SurfaceTransitionSource;
  correlationId: string;
} {
  return {
    source: source || defaultSource,
    correlationId: resolveCorrelationId(correlationId, fallbackCorrelationPrefix),
  };
}
