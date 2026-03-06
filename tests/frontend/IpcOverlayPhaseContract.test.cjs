/** @jest-environment node */

const {
  createResponseOverlayPhaseEnum,
  RESPONSE_OVERLAY_METADATA_KEYS,
  RESPONSE_OVERLAY_PHASES,
  normalizeOverlayNumber,
  normalizeOverlayString,
} = require('../../frontend/src/main/ipc/ipc_overlay_phase_contract.cjs');

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
    expect(normalizeOverlayString(' req-1 ')).toBe('req-1');
    expect(normalizeOverlayString('')).toBeNull();
    expect(normalizeOverlayString('   ')).toBeNull();
    expect(normalizeOverlayString(undefined)).toBeNull();
  });

  test('normalizes overlay numbers with finite guard', () => {
    expect(normalizeOverlayNumber(1)).toBe(1);
    expect(normalizeOverlayNumber(0)).toBe(0);
    expect(normalizeOverlayNumber(Infinity)).toBeNull();
    expect(normalizeOverlayNumber(NaN)).toBeNull();
    expect(normalizeOverlayNumber('1')).toBeNull();
  });
});
