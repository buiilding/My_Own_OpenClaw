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

  test('build helpers clone payloads so caller mutation does not rewrite envelopes', () => {
    const singlePayload = {
      request_id: 'req-wrap',
      metadata: { source: 'wrapper-single' },
    };
    const bundlePayload = {
      bundle_id: 'bundle-wrap',
      metadata: { source: 'wrapper-bundle' },
    };

    const singleEnvelope = buildToolRunnerResultEnvelope(singlePayload);
    const bundleEnvelope = buildToolRunnerBundleResultEnvelope(bundlePayload);

    singlePayload.request_id = 'req-wrap-mutated';
    singlePayload.metadata.source = 'wrapper-single-mutated';
    bundlePayload.bundle_id = 'bundle-wrap-mutated';
    bundlePayload.metadata.source = 'wrapper-bundle-mutated';

    expect(singleEnvelope.payload).toEqual({
      request_id: 'req-wrap',
      metadata: { source: 'wrapper-single' },
    });
    expect(bundleEnvelope.payload).toEqual({
      bundle_id: 'bundle-wrap',
      metadata: { source: 'wrapper-bundle' },
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
