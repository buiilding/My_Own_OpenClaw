/**
 * Covers response overlay phase contract. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayPhaseRuntime } from '../../src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime';
import responseOverlayPhaseContract from '../../src/shared/response_overlay_phase_contract.json';

describe('responseOverlayPhaseContract', () => {
  const {
    getResponseOverlayPhaseMap,
    getResponseOverlayPhaseValues,
    getResponseOverlayPreflightGuardRef,
  } = DesktopResponseOverlayPhaseRuntime;

  test('exposes canonical phase list and semantic phase map snapshot', () => {
    expect(DesktopResponseOverlayPhaseRuntime).not.toHaveProperty('RESPONSE_OVERLAY_PHASE');
    expect(getResponseOverlayPhaseValues()).toEqual([
      'idle',
      'awaiting-first-chunk',
      'streaming',
      'tool-call',
      'tool-output',
      'complete',
      'error',
    ]);
    expect(getResponseOverlayPhaseMap()).toEqual({
      IDLE: 'idle',
      AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
      STREAMING: 'streaming',
      TOOL_CALL: 'tool-call',
      TOOL_OUTPUT: 'tool-output',
      COMPLETE: 'complete',
      ERROR: 'error',
    });
  });

  test('keeps canonical preflight source and renderer guard', () => {
    expect(DesktopResponseOverlayPhaseRuntime).not.toHaveProperty('RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF');
    expect(responseOverlayPhaseContract.preflight.source).toBe('renderer-send-preflight');
    expect(getResponseOverlayPreflightGuardRef()).toBe('renderer-send-preflight');
  });
});
