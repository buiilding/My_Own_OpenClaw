import { resolveCorrelationId } from './state';
import {
  DEFAULT_CAPTURE_FOCUS_PREPARE_WAIT_MS,
  DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS,
  DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS,
  type SurfaceTransitionSource,
} from './types';

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

export function resolveInteractiveFocusPreparationOptions(
  focusWaitMs: number | null | undefined,
  focusMaxAttempts: number | null | undefined,
): {
  waitMs: number;
  maxAttempts: number;
} {
  return {
    waitMs: typeof focusWaitMs === 'number'
      ? focusWaitMs
      : DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS,
    maxAttempts: typeof focusMaxAttempts === 'number'
      ? focusMaxAttempts
      : DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS,
  };
}

export function resolveCaptureFocusPreparationWaitMs(waitMs: number | null | undefined): number {
  return typeof waitMs === 'number'
    ? waitMs
    : DEFAULT_CAPTURE_FOCUS_PREPARE_WAIT_MS;
}
