import { resolveToolRunnerEnvelopeCorrelationId } from './toolRunnerResultContracts';

export function resolveToolRunnerPayloadCorrelationId(payload: unknown): string | null {
  return resolveToolRunnerEnvelopeCorrelationId(payload);
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
