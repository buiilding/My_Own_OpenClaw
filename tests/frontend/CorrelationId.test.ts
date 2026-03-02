import {
  resolveCorrelationId,
} from '../../frontend/src/renderer/infrastructure/services/CorrelationId';

describe('CorrelationId utility', () => {
  test('resolves first valid correlation id from candidate list', () => {
    expect(resolveCorrelationId(undefined, '   ', ' req-1 ', 'corr-2')).toBe('req-1');
    expect(resolveCorrelationId(null, false, 0, 'corr-3')).toBe('corr-3');
    expect(resolveCorrelationId(undefined, '  ', null)).toBeNull();
  });
});
