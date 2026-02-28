type BackendToolResultEnvelope = {
  type?: string;
  payload?: Record<string, unknown> | null;
} | null;

export function resolveToolRunnerPayloadCorrelationId(payload: unknown): string | null {
  const message = payload as BackendToolResultEnvelope;
  const payloadType = message?.type;
  const payloadBody = message?.payload;

  if (payloadType === 'tool-result' && typeof payloadBody?.request_id === 'string') {
    return payloadBody.request_id;
  }

  if (payloadType === 'tool-bundle-result' && typeof payloadBody?.bundle_id === 'string') {
    return payloadBody.bundle_id;
  }

  return null;
}

export function shouldDropUntrackedToolRunnerPayload(
  correlationId: string | null,
  shouldAcceptExecutionResult: (correlationId: string) => boolean,
): boolean {
  if (!correlationId) {
    return false;
  }
  return !shouldAcceptExecutionResult(correlationId);
}
