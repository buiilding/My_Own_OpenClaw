import {
  parseResponseOverlayPhasePayload,
} from '../../frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhasePayload';
import {
  RESPONSE_OVERLAY_PHASE,
} from '../../frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract';

describe('responseOverlayPhasePayload', () => {
  test('exports canonical response overlay phases', () => {
    expect(Object.values(RESPONSE_OVERLAY_PHASE)).toEqual([
      'idle',
      'awaiting-first-chunk',
      'streaming',
      'tool-call',
      'tool-output',
      'complete',
      'error',
    ]);
  });

  test('parses valid payload and normalizes optional fields', () => {
    expect(parseResponseOverlayPhasePayload({
      phase: 'tool-call',
      source: 'backend',
      correlation_id: 'req-1',
      attempt: 2,
      max_attempts: 5,
      recovery_stage: 'tool-call',
      failure_reason: 'focus_retrying',
    })).toEqual({
      phase: 'tool-call',
      source: 'backend',
      correlation_id: 'req-1',
      attempt: 2,
      max_attempts: 5,
      recovery_stage: 'tool-call',
      failure_reason: 'focus_retrying',
    });
  });

  test('filters invalid optional metadata values', () => {
    expect(parseResponseOverlayPhasePayload({
      phase: 'streaming',
      source: '',
      correlation_id: '',
      attempt: Infinity,
      max_attempts: NaN,
      recovery_stage: '',
      failure_reason: '',
    })).toEqual({
      phase: 'streaming',
      source: undefined,
      correlation_id: undefined,
      attempt: undefined,
      max_attempts: undefined,
      recovery_stage: undefined,
      failure_reason: undefined,
    });
  });

  test('trims string metadata and drops whitespace-only values', () => {
    expect(parseResponseOverlayPhasePayload({
      phase: ' streaming ',
      source: ' backend ',
      correlation_id: '   ',
      recovery_stage: ' tool-output ',
      failure_reason: '\t',
    })).toEqual({
      phase: 'streaming',
      source: 'backend',
      correlation_id: undefined,
      attempt: undefined,
      max_attempts: undefined,
      recovery_stage: 'tool-output',
      failure_reason: undefined,
    });
  });

  test('returns null for invalid phase payloads', () => {
    expect(parseResponseOverlayPhasePayload({ phase: 'unknown-phase' })).toBeNull();
    expect(parseResponseOverlayPhasePayload({ phase: '' })).toBeNull();
    expect(parseResponseOverlayPhasePayload({})).toBeNull();
    expect(parseResponseOverlayPhasePayload(null)).toBeNull();
  });
});
