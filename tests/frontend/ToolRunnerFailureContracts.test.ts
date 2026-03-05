import {
  buildBundleSurfaceFailureEnvelope,
  buildStaleBundleResultEnvelope,
  buildStaleToolResultEnvelope,
  buildSurfaceFailureError,
  buildToolSurfaceFailureEnvelope,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerFailureContracts';

describe('toolRunnerFailureContracts', () => {
  test('builds surface failure error string with optional reason', () => {
    expect(buildSurfaceFailureError(null)).toBe('frontend_execution_surface_unavailable');
    expect(buildSurfaceFailureError('external_window_focus_not_verified')).toBe(
      'frontend_execution_surface_unavailable: external_window_focus_not_verified',
    );
  });

  test('builds stale turn envelopes for single tools and bundles', () => {
    expect(buildStaleToolResultEnvelope('req-1')).toEqual({
      type: 'tool-result',
      payload: {
        request_id: 'req-1',
        success: false,
        data: null,
        error: 'frontend_stale_turn_cancelled',
      },
    });

    expect(buildStaleBundleResultEnvelope('bundle-1')).toEqual({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-1',
        status: 'failure',
        step_results: [],
        error: 'frontend_stale_turn_cancelled',
      },
    });
  });

  test('builds surface failure envelopes for single tools and bundles', () => {
    expect(buildToolSurfaceFailureEnvelope('req-2', 'focus_failed')).toEqual({
      type: 'tool-result',
      payload: {
        request_id: 'req-2',
        success: false,
        data: null,
        error: 'frontend_execution_surface_unavailable: focus_failed',
      },
    });

    expect(buildBundleSurfaceFailureEnvelope('bundle-2', null)).toEqual({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: 'bundle-2',
        status: 'failure',
        step_results: [],
        error: 'frontend_execution_surface_unavailable',
      },
    });
  });
});
