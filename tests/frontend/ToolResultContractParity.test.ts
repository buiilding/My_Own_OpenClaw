import {
  buildToolBundleResultEnvelope,
  buildToolResultEnvelope,
  resolveToolResultEnvelopeCorrelationId,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolResultEnvelope';
import {
  buildToolRunnerBundleResultEnvelope,
  buildToolRunnerResultEnvelope,
  resolveToolRunnerEnvelopeCorrelationId,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerResultContracts';
import { resolveToolRunnerPayloadCorrelationId } from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerBackendPayload';

describe('tool result contract parity', () => {
  test('tool-runner and infrastructure envelope builders stay wire-compatible', () => {
    const infraSingle = buildToolResultEnvelope({ request_id: 'req-1', success: true });
    const runnerSingle = buildToolRunnerResultEnvelope({ request_id: 'req-1', success: true });

    const infraBundle = buildToolBundleResultEnvelope({ bundle_id: 'bundle-1', status: 'success' });
    const runnerBundle = buildToolRunnerBundleResultEnvelope({ bundle_id: 'bundle-1', status: 'success' });

    expect(runnerSingle).toEqual(infraSingle);
    expect(runnerBundle).toEqual(infraBundle);
  });

  test('correlation id resolution stays consistent across runner/backend payload helpers', () => {
    const envelopes = [
      buildToolResultEnvelope({ request_id: 'req-2', success: true }),
      buildToolBundleResultEnvelope({ bundle_id: 'bundle-2', status: 'failure' }),
    ];

    for (const envelope of envelopes) {
      expect(resolveToolRunnerEnvelopeCorrelationId(envelope)).toBe(
        resolveToolResultEnvelopeCorrelationId(envelope),
      );
      expect(resolveToolRunnerPayloadCorrelationId(envelope)).toBe(
        resolveToolResultEnvelopeCorrelationId(envelope),
      );
    }
  });

  test('correlation id normalization parity includes trim-and-empty semantics', () => {
    const normalizedEnvelope = buildToolResultEnvelope({
      request_id: '  req-normalized  ',
      success: true,
    });
    const emptyEnvelope = buildToolResultEnvelope({
      request_id: '   ',
      success: true,
    });

    expect(resolveToolRunnerEnvelopeCorrelationId(normalizedEnvelope)).toBe('req-normalized');
    expect(resolveToolResultEnvelopeCorrelationId(normalizedEnvelope)).toBe('req-normalized');
    expect(resolveToolRunnerPayloadCorrelationId(normalizedEnvelope)).toBe('req-normalized');

    expect(resolveToolRunnerEnvelopeCorrelationId(emptyEnvelope)).toBeNull();
    expect(resolveToolResultEnvelopeCorrelationId(emptyEnvelope)).toBeNull();
    expect(resolveToolRunnerPayloadCorrelationId(emptyEnvelope)).toBeNull();
  });
});
