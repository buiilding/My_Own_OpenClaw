/** @jest-environment node */

const {
  createResponseOverlayPhaseContractRuntime,
  createResponseOverlayPhaseEnum,
  RESPONSE_OVERLAY_METADATA_KEYS,
  RESPONSE_OVERLAY_PHASES,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
} = require('../../src/main/ipc/ipc_overlay_phase_contract.cjs');

const overlayPhaseContractModule = require('../../src/main/ipc/ipc_overlay_phase_contract.cjs');

describe('ipc_overlay_phase_contract', () => {
  test('exports canonical phase and metadata keys', () => {
    expect(RESPONSE_OVERLAY_PHASES.has('idle')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('tool-call')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('error')).toBe(true);
    expect(RESPONSE_OVERLAY_PHASES.has('invalid')).toBe(false);
    expect(RESPONSE_OVERLAY_METADATA_KEYS).toEqual([
      'correlation_id',
      'attempt',
      'max_attempts',
      'recovery_stage',
      'failure_reason',
    ]);
  });

  test('exports canonical preflight source and guard', () => {
    expect(RESPONSE_OVERLAY_PREFLIGHT_SOURCE).toBe('renderer-send-preflight');
    expect(RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF).toBe('renderer-send-preflight');
  });

  test('builds canonical response overlay phase enum object', () => {
    expect(createResponseOverlayPhaseEnum()).toEqual({
      IDLE: 'idle',
      AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
      STREAMING: 'streaming',
      TOOL_CALL: 'tool-call',
      TOOL_OUTPUT: 'tool-output',
      COMPLETE: 'complete',
      ERROR: 'error',
    });
  });

  test('normalizes overlay strings by trimming and filtering empties', () => {
    const runtime = createResponseOverlayPhaseContractRuntime();

    expect(runtime.normalizeEventString(' req-1 ')).toBe('req-1');
    expect(runtime.normalizeEventString('')).toBeNull();
    expect(runtime.normalizeEventString('   ')).toBeNull();
    expect(runtime.normalizeEventString(undefined)).toBeNull();
    expect(overlayPhaseContractModule.normalizeOverlayString).toBeUndefined();
  });

  test('normalizes overlay numbers with finite guard', () => {
    const runtime = createResponseOverlayPhaseContractRuntime();

    expect(runtime.normalizeEventNumber(1)).toBe(1);
    expect(runtime.normalizeEventNumber(0)).toBe(0);
    expect(runtime.normalizeEventNumber(Infinity)).toBeNull();
    expect(runtime.normalizeEventNumber(NaN)).toBeNull();
    expect(runtime.normalizeEventNumber('1')).toBeNull();
    expect(overlayPhaseContractModule.normalizeOverlayNumber).toBeUndefined();
  });

  test('normalizes overlay metadata through the contract runtime', () => {
    const runtime = createResponseOverlayPhaseContractRuntime();

    expect(runtime.hasPhase('tool-output')).toBe(true);
    expect(runtime.hasPhase('invalid')).toBe(false);
    expect(runtime.normalizeMetadata({
      correlation_id: ' req-2 ',
      attempt: 2,
      max_attempts: Infinity,
      recovery_stage: '',
      failure_reason: ' failed ',
      ignored: 'value',
    })).toEqual({
      correlation_id: 'req-2',
      attempt: 2,
      failure_reason: 'failed',
    });
    expect(runtime.areMetadataEqual(
      { correlation_id: 'req-2', attempt: 2 },
      { correlation_id: 'req-2', attempt: 2 },
    )).toBe(true);
  });
});
