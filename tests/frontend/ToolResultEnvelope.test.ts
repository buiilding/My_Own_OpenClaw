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

  test('build helpers deep-clone payloads to prevent mutation leaks', () => {
    const singlePayload = {
      request_id: 'req-original',
      metadata: { source: 'single' },
    };
    const bundlePayload = {
      bundle_id: 'bundle-original',
      metadata: { source: 'bundle' },
    };

    const singleEnvelope = buildToolResultEnvelope(singlePayload);
    const bundleEnvelope = buildToolBundleResultEnvelope(bundlePayload);

    singlePayload.request_id = 'req-mutated';
    singlePayload.metadata.source = 'single-mutated';
    bundlePayload.bundle_id = 'bundle-mutated';
    bundlePayload.metadata.source = 'bundle-mutated';

    expect(singleEnvelope.payload).toEqual({
      request_id: 'req-original',
      metadata: { source: 'single' },
    });
    expect(bundleEnvelope.payload).toEqual({
      bundle_id: 'bundle-original',
      metadata: { source: 'bundle' },
    });
  });

  test('build helpers preserve clone behavior when structuredClone is unavailable', () => {
    const originalStructuredClone = globalThis.structuredClone;
    // Force JSON clone fallback branch.
    (globalThis as { structuredClone?: (value: unknown) => unknown }).structuredClone = undefined;

    try {
      const payload = {
        request_id: 'req-fallback',
        metadata: { source: 'fallback' },
      };
      const envelope = buildToolResultEnvelope(payload);

      payload.request_id = 'req-fallback-mutated';
      payload.metadata.source = 'fallback-mutated';

      expect(envelope.payload).toEqual({
        request_id: 'req-fallback',
        metadata: { source: 'fallback' },
      });
    } finally {
      (globalThis as { structuredClone?: (value: unknown) => unknown }).structuredClone =
        originalStructuredClone;
    }
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
