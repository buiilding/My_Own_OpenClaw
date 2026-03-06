import {
  buildToolBundleResultEnvelope,
  buildToolResultEnvelope,
  resolveToolResultEnvelopeCorrelationId,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolResultEnvelope';

describe('ToolResultEnvelope', () => {
  test('builds single and bundle result envelopes', () => {
    expect(buildToolResultEnvelope({ request_id: 'req-1', success: true })).toEqual({
      type: 'tool-result',
      payload: { request_id: 'req-1', success: true },
    });

    expect(buildToolBundleResultEnvelope({ bundle_id: 'bundle-1', status: 'success' })).toEqual({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'bundle-1', status: 'success' },
    });
  });

  test('resolves correlation id from supported envelopes only', () => {
    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'tool-result',
      payload: { request_id: 'req-2' },
    })).toBe('req-2');

    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'bundle-2' },
    })).toBe('bundle-2');

    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'tool-result',
      payload: { request_id: 123 },
    })).toBeNull();

    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'unknown',
      payload: { request_id: 'req-3' },
    })).toBeNull();
  });

  test('normalizes whitespace in envelope correlation ids', () => {
    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'tool-result',
      payload: { request_id: '  req-4  ' },
    })).toBe('req-4');

    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: '  bundle-4  ' },
    })).toBe('bundle-4');

    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'tool-result',
      payload: { request_id: '   ' },
    })).toBeNull();

    expect(resolveToolResultEnvelopeCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: '   ' },
    })).toBeNull();
  });
});
