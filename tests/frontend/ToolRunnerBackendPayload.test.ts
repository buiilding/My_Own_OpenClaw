import {
  requiresToolRunnerPayloadCorrelationId,
  resolveToolRunnerPayloadCorrelationId,
  shouldDropUntrackedToolRunnerPayload,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerBackendPayload';

describe('toolRunnerBackendPayload', () => {
  test('resolves correlation id from tool-result and tool-bundle-result payloads', () => {
    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'tool-result',
      payload: { request_id: 'req-1' },
    })).toBe('req-1');

    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'bundle-1' },
    })).toBe('bundle-1');
  });

  test('normalizes whitespace in resolved correlation ids', () => {
    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'tool-result',
      payload: { request_id: '  req-5  ' },
    })).toBe('req-5');

    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: '  bundle-5  ' },
    })).toBe('bundle-5');

    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'tool-result',
      payload: { request_id: '   ' },
    })).toBeNull();
  });

  test('returns null for unsupported payloads or missing ids', () => {
    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'tool-result',
      payload: { request_id: 1 },
    })).toBeNull();

    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: null },
    })).toBeNull();

    expect(resolveToolRunnerPayloadCorrelationId({
      type: 'query',
      payload: { request_id: 'req-2' },
    })).toBeNull();

    expect(resolveToolRunnerPayloadCorrelationId(null)).toBeNull();
  });

  test('drops payload only when correlation id exists and acceptance gate rejects', () => {
    const reject = jest.fn().mockReturnValue(false);
    const accept = jest.fn().mockReturnValue(true);

    expect(shouldDropUntrackedToolRunnerPayload('req-3', reject)).toBe(true);
    expect(reject).toHaveBeenCalledWith('req-3');

    expect(shouldDropUntrackedToolRunnerPayload('req-4', accept)).toBe(false);
    expect(accept).toHaveBeenCalledWith('req-4');

    expect(shouldDropUntrackedToolRunnerPayload(null, reject)).toBe(false);
  });

  test('marks tool result envelopes as requiring correlation ids', () => {
    expect(requiresToolRunnerPayloadCorrelationId({
      type: 'tool-result',
      payload: { request_id: 'req-1' },
    })).toBe(true);

    expect(requiresToolRunnerPayloadCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'bundle-1' },
    })).toBe(true);

    expect(requiresToolRunnerPayloadCorrelationId({
      type: 'query',
      payload: { request_id: 'req-1' },
    })).toBe(false);

    expect(requiresToolRunnerPayloadCorrelationId(null)).toBe(false);
  });
});
