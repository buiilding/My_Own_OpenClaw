import { resolveCorrelationId } from '../../../infrastructure/services/CorrelationId';

type ToolCallCorrelationPayload = {
  correlation_id?: string | null;
  request_id?: string | null;
};

type ToolOutputCorrelationPayload = {
  request_id?: string | null;
  metadata?: unknown;
};

type ToolBundleCorrelationPayload = {
  bundle_id?: string | null;
};

export function resolveToolCallCorrelationId(
  payload: ToolCallCorrelationPayload | null | undefined,
  eventId?: string | null,
): string | undefined {
  return resolveCorrelationId(
    payload?.correlation_id,
    payload?.request_id,
    eventId,
  ) || undefined;
}

export function resolveToolOutputCorrelationId(
  payload: ToolOutputCorrelationPayload | null | undefined,
  eventId?: string | null,
): string | undefined {
  const metadataRequestId = (
    typeof payload?.metadata === 'object'
      ? (payload?.metadata as any)?.request_id
      : undefined
  );
  return resolveCorrelationId(
    payload?.request_id,
    metadataRequestId,
    eventId,
  ) || undefined;
}

export function resolveToolBundleCorrelationId(
  payload: ToolBundleCorrelationPayload | null | undefined,
): string | undefined {
  return resolveCorrelationId(
    payload?.bundle_id,
  ) || undefined;
}
