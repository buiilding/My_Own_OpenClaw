/** @jest-environment node */

import {
  RESPONSE_OVERLAY_PHASE as rendererPhaseEnum,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF as rendererPreflightGuardRef,
} from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime';
import responseOverlayPhaseContract from '../../frontend/src/shared/response_overlay_phase_contract.json';

const {
  createResponseOverlayPhaseEnum,
  RESPONSE_OVERLAY_PHASES: mainPhaseSet,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF: mainPreflightGuardRef,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE: mainPreflightSource,
} = require('../../frontend/src/main/ipc/ipc_overlay_phase_contract.cjs');

describe('overlay phase contract parity', () => {
  test('keeps renderer and main phase sequence in lockstep', () => {
    expect(Array.from(mainPhaseSet)).toEqual(Object.values(rendererPhaseEnum));
  });

  test('keeps renderer and main phase enum mapping in lockstep', () => {
    expect(createResponseOverlayPhaseEnum()).toEqual(rendererPhaseEnum);
  });

  test('keeps renderer and main preflight identity in lockstep', () => {
    expect(mainPreflightSource).toBe(responseOverlayPhaseContract.preflight.source);
    expect(mainPreflightGuardRef).toBe(rendererPreflightGuardRef);
  });
});
