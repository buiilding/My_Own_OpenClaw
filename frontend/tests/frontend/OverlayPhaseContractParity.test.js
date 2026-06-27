/** @jest-environment node */

import { DesktopResponseOverlayPhaseRuntime } from '../../src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime';
import responseOverlayPhaseContract from '../../src/shared/response_overlay_phase_contract.json';

const {
  createResponseOverlayPhaseEnum,
  RESPONSE_OVERLAY_PHASES: mainPhaseSet,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF: mainPreflightGuardRef,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE: mainPreflightSource,
} = require('../../src/main/ipc/ipc_overlay_phase_contract.cjs');

describe('overlay phase contract parity', () => {
  const {
    getResponseOverlayPhaseMap,
    getResponseOverlayPhaseValues,
    getResponseOverlayPreflightGuardRef,
  } = DesktopResponseOverlayPhaseRuntime;

  test('keeps renderer and main phase sequence in lockstep', () => {
    expect(Array.from(mainPhaseSet)).toEqual(getResponseOverlayPhaseValues());
  });

  test('keeps renderer and main phase enum mapping in lockstep', () => {
    expect(createResponseOverlayPhaseEnum()).toEqual(getResponseOverlayPhaseMap());
  });

  test('keeps renderer and main preflight identity in lockstep', () => {
    expect(mainPreflightSource).toBe(responseOverlayPhaseContract.preflight.source);
    expect(mainPreflightGuardRef).toBe(getResponseOverlayPreflightGuardRef());
  });
});
