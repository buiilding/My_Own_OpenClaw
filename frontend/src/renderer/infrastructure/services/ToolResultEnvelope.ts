export const TOOL_RESULT_ENVELOPE_TYPE = 'tool-result';
export const TOOL_BUNDLE_RESULT_ENVELOPE_TYPE = 'tool-bundle-result';

export type ToolResultEnvelopeType =
  | typeof TOOL_RESULT_ENVELOPE_TYPE
  | typeof TOOL_BUNDLE_RESULT_ENVELOPE_TYPE;

type ToolResultEnvelopePayload = Record<string, unknown>;

type ToolResultEnvelopeCandidate = {
  type?: string;
  payload?: ToolResultEnvelopePayload | null;
} | null;

export function buildToolResultEnvelope(payload: ToolResultEnvelopePayload) {
  return {
    type: TOOL_RESULT_ENVELOPE_TYPE,
    payload,
  };
}

export function buildToolBundleResultEnvelope(payload: ToolResultEnvelopePayload) {
  return {
    type: TOOL_BUNDLE_RESULT_ENVELOPE_TYPE,
    payload,
  };
}

export function resolveToolResultEnvelopeCorrelationId(envelope: unknown): string | null {
  const candidate = envelope as ToolResultEnvelopeCandidate;
  const payloadType = candidate?.type;
  const payloadBody = candidate?.payload;

  if (payloadType === TOOL_RESULT_ENVELOPE_TYPE && typeof payloadBody?.request_id === 'string') {
    return payloadBody.request_id;
  }

  if (
    payloadType === TOOL_BUNDLE_RESULT_ENVELOPE_TYPE
    && typeof payloadBody?.bundle_id === 'string'
  ) {
    return payloadBody.bundle_id;
  }

  return null;
}
