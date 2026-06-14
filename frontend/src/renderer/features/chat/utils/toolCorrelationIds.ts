/**
 * Provides the tool correlation ids module for the renderer UI.
 */

import {
  resolveToolCallCorrelationId as resolveSdkToolCallCorrelationId,
  resolveToolOutputCorrelationId as resolveSdkToolOutputCorrelationId,
} from '../../../infrastructure/api/windieSdkClient';

type ToolCallCorrelationPayload = {
  correlation_id?: string | null;
  request_id?: string | null;
  tool_call_id?: string | null;
};

type ToolOutputCorrelationPayload = {
  request_id?: string | null;
  tool_call_id?: string | null;
  metadata?: {
    request_id?: string | null;
    tool_call_id?: string | null;
  } | null;
};

export function resolveToolCallCorrelationId(
  payload: ToolCallCorrelationPayload | null | undefined,
  eventId?: string | null,
): string | undefined {
  return resolveSdkToolCallCorrelationId(payload, eventId);
}

export function resolveToolOutputCorrelationId(
  payload: ToolOutputCorrelationPayload | null | undefined,
  eventId?: string | null,
): string | undefined {
  return resolveSdkToolOutputCorrelationId(payload, eventId);
}
