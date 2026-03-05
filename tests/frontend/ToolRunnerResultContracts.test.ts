import {
  buildToolRunnerBundleResultEnvelope,
  buildToolRunnerResultEnvelope,
  resolveToolRunnerEnvelopeCorrelationId,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerResultContracts';

describe('toolRunnerResultContracts', () => {
  test('builds single and bundle result envelopes with canonical type fields', () => {
    expect(buildToolRunnerResultEnvelope({ request_id: 'req-1', success: true })).toEqual({
      type: 'tool-result',
      payload: { request_id: 'req-1', success: true },
    });

    expect(buildToolRunnerBundleResultEnvelope({ bundle_id: 'bundle-1', status: 'failure' })).toEqual({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'bundle-1', status: 'failure' },
    });
  });

  test('resolves correlation id from supported envelopes only', () => {
    expect(resolveToolRunnerEnvelopeCorrelationId({
      type: 'tool-result',
      payload: { request_id: 'req-2' },
    })).toBe('req-2');

    expect(resolveToolRunnerEnvelopeCorrelationId({
      type: 'tool-bundle-result',
      payload: { bundle_id: 'bundle-2' },
    })).toBe('bundle-2');

    expect(resolveToolRunnerEnvelopeCorrelationId({
      type: 'tool-result',
      payload: { request_id: 1 },
    })).toBeNull();

    expect(resolveToolRunnerEnvelopeCorrelationId({
      type: 'query',
      payload: { request_id: 'req-3' },
    })).toBeNull();
  });
});
