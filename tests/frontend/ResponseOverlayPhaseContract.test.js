import {
  isResponseOverlayPhase,
  normalizeResponseOverlayNumber,
  normalizeResponseOverlayString,
  RESPONSE_OVERLAY_METADATA_KEYS,
  RESPONSE_OVERLAY_PHASE,
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

  test('exports canonical metadata keys', () => {
    expect(RESPONSE_OVERLAY_METADATA_KEYS).toEqual([
      'correlation_id',
      'attempt',
      'max_attempts',
      'recovery_stage',
      'failure_reason',
    ]);
  });

  test('normalizes phase strings and validates known phases', () => {
    expect(normalizeResponseOverlayString(' tool-call ')).toBe('tool-call');
    expect(normalizeResponseOverlayString('   ')).toBeUndefined();
    expect(normalizeResponseOverlayString(undefined)).toBeUndefined();

    expect(isResponseOverlayPhase('tool-call')).toBe(true);
    expect(isResponseOverlayPhase('invalid')).toBe(false);
    expect(isResponseOverlayPhase(undefined)).toBe(false);
  });

  test('normalizes finite numeric metadata fields', () => {
    expect(normalizeResponseOverlayNumber(2)).toBe(2);
    expect(normalizeResponseOverlayNumber(0)).toBe(0);
    expect(normalizeResponseOverlayNumber(NaN)).toBeUndefined();
    expect(normalizeResponseOverlayNumber(Infinity)).toBeUndefined();
    expect(normalizeResponseOverlayNumber('2')).toBeUndefined();
  });
});
