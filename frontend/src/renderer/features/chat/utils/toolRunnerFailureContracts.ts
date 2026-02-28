const STALE_TURN_CANCELLED_ERROR = 'frontend_stale_turn_cancelled';
const SURFACE_UNAVAILABLE_PREFIX = 'frontend_execution_surface_unavailable';

export function buildSurfaceFailureError(reason: string | null): string {
  return `${SURFACE_UNAVAILABLE_PREFIX}${reason ? `: ${reason}` : ''}`;
}

export function buildStaleToolResultEnvelope(requestId: string) {
  return {
    type: 'tool-result',
    payload: {
      request_id: requestId,
      success: false,
      data: null,
      error: STALE_TURN_CANCELLED_ERROR,
    },
  };
}

export function buildStaleBundleResultEnvelope(bundleId: string) {
  return {
    type: 'tool-bundle-result',
    payload: {
      bundle_id: bundleId,
      status: 'failure',
      step_results: [],
      error: STALE_TURN_CANCELLED_ERROR,
    },
  };
}

export function buildToolSurfaceFailureEnvelope(requestId: string, reason: string | null) {
  return {
    type: 'tool-result',
    payload: {
      request_id: requestId,
      success: false,
      data: null,
      error: buildSurfaceFailureError(reason),
    },
  };
}

export function buildBundleSurfaceFailureEnvelope(bundleId: string, reason: string | null) {
  return {
    type: 'tool-bundle-result',
    payload: {
      bundle_id: bundleId,
      status: 'failure',
      step_results: [],
      error: buildSurfaceFailureError(reason),
    },
  };
}
