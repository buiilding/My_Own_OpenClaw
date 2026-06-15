/** @jest-environment node */

import {
  RESPONSE_OVERLAY_METADATA_KEYS as rendererMetadataKeys,
  RESPONSE_OVERLAY_PHASE as rendererPhaseEnum,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF as rendererPreflightGuardRef,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE as rendererPreflightSource,
} from '../../frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract';

const {
  createResponseOverlayPhaseEnum,
  RESPONSE_OVERLAY_METADATA_KEYS: mainMetadataKeys,
  RESPONSE_OVERLAY_PHASES: mainPhaseSet,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF: mainPreflightGuardRef,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE: mainPreflightSource,
} = require('../../frontend/src/main/ipc/ipc_overlay_phase_contract.cjs');

describe('overlay phase contract parity', () => {
  test('keeps renderer and main phase sequence in lockstep', () => {
    expect(Array.from(mainPhaseSet)).toEqual(Object.values(rendererPhaseEnum));
  });

  test('keeps renderer and main metadata keys in lockstep', () => {
    expect(mainMetadataKeys).toEqual(rendererMetadataKeys);
  });

  test('keeps renderer and main phase enum mapping in lockstep', () => {
    expect(createResponseOverlayPhaseEnum()).toEqual(rendererPhaseEnum);
  });

  test('keeps renderer and main preflight identity in lockstep', () => {
    expect(mainPreflightSource).toBe(rendererPreflightSource);
    expect(mainPreflightGuardRef).toBe(rendererPreflightGuardRef);
  });
});
