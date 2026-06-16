/**
 * Covers response overlay phase contract. behavior in the frontend test suite.
 */

import {
  RESPONSE_OVERLAY_PHASE,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
} from '../../frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract';

describe('responseOverlayPhaseContract', () => {
  test('exports canonical phase list and enum object', () => {
    expect(Object.values(RESPONSE_OVERLAY_PHASE)).toEqual([
      'idle',
      'awaiting-first-chunk',
      'streaming',
      'tool-call',
      'tool-output',
      'complete',
      'error',
    ]);
    expect(RESPONSE_OVERLAY_PHASE).toEqual({
      IDLE: 'idle',
      AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
      STREAMING: 'streaming',
      TOOL_CALL: 'tool-call',
      TOOL_OUTPUT: 'tool-output',
      COMPLETE: 'complete',
      ERROR: 'error',
    });
  });

  test('exports canonical preflight source and guard', () => {
    expect(RESPONSE_OVERLAY_PREFLIGHT_SOURCE).toBe('renderer-send-preflight');
    expect(RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF).toBe('renderer-send-preflight');
  });
});
