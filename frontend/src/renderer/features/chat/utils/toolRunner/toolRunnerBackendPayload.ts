import { resolveToolRunnerEnvelopeCorrelationId } from './toolRunnerResultContracts';

const CORRELATED_PAYLOAD_TYPES = new Set(['tool-result', 'tool-bundle-result']);

export function resolveToolRunnerPayloadCorrelationId(payload: unknown): string | null {
  return resolveToolRunnerEnvelopeCorrelationId(payload);
}

export function requiresToolRunnerPayloadCorrelationId(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const type = (payload as { type?: unknown }).type;
  return typeof type === 'string' && CORRELATED_PAYLOAD_TYPES.has(type);
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
