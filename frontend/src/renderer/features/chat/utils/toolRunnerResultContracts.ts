export const TOOL_RUNNER_RESULT_TYPE = 'tool-result';
export const TOOL_RUNNER_BUNDLE_RESULT_TYPE = 'tool-bundle-result';

type ToolRunnerEnvelopeCandidate = {
  type?: string;
  payload?: Record<string, unknown> | null;
} | null;

export function buildToolRunnerResultEnvelope(payload: Record<string, unknown>) {
  return {
    type: TOOL_RUNNER_RESULT_TYPE,
    payload,
  };
}

export function buildToolRunnerBundleResultEnvelope(payload: Record<string, unknown>) {
  return {
    type: TOOL_RUNNER_BUNDLE_RESULT_TYPE,
    payload,
  };
}

export function resolveToolRunnerEnvelopeCorrelationId(envelope: unknown): string | null {
  const candidate = envelope as ToolRunnerEnvelopeCandidate;
  const payloadType = candidate?.type;
  const payloadBody = candidate?.payload;

  if (payloadType === TOOL_RUNNER_RESULT_TYPE && typeof payloadBody?.request_id === 'string') {
    return payloadBody.request_id;
  }

  if (payloadType === TOOL_RUNNER_BUNDLE_RESULT_TYPE && typeof payloadBody?.bundle_id === 'string') {
    return payloadBody.bundle_id;
  }

  return null;
}
