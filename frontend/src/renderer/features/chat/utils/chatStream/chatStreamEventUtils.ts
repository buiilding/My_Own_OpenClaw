import { buildArtifactUrl } from '../../../../infrastructure/services/ArtifactUploader';
import {
  resolveToolCallCorrelationId as resolveSharedToolCallCorrelationId,
  resolveToolOutputCorrelationId as resolveSharedToolOutputCorrelationId,
} from '../toolCorrelationIds';

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const RECOVERABLE_TOOL_PARSE_ERROR_MARKERS = [
  'failed to parse streamed tool-call arguments',
  'raw arguments preview:',
];

type ErrorPayload = {
  message?: unknown;
  content?: unknown;
};

type ToolOutputPayload = {
  request_id?: string | null;
  metadata?: unknown;
};

type ToolCallPayload = {
  correlation_id?: string | null;
  request_id?: string | null;
};

export function shouldIgnoreStreamError(payload: ErrorPayload | null | undefined): boolean {
  const message = payload?.message;
  const content = payload?.content;
  const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';
  const normalizedContent = typeof content === 'string' ? content.toLowerCase() : '';
  const isRecoverableToolParseError = RECOVERABLE_TOOL_PARSE_ERROR_MARKERS.every((marker) => (
    normalizedMessage.includes(marker) || normalizedContent.includes(marker)
  ));
  return (
    (typeof message === 'string' && message.includes(SETTINGS_UPDATE_ERROR_TEXT))
    || (typeof content === 'string' && content.includes(SETTINGS_UPDATE_ERROR_TEXT))
    || isRecoverableToolParseError
  );
}

export function buildScreenshotAttachment(
  screenshotRef: string | null | undefined,
  screenshotUrl?: string | null,
) {
  const normalizedRef = screenshotRef || null;
  return {
    screenshotRef: normalizedRef,
    screenshotUrl: screenshotUrl || (normalizedRef ? buildArtifactUrl(normalizedRef) : null),
  };
}

export function buildScreenshotAttachments(
  screenshotRefs: Array<string | null | undefined> | null | undefined,
  screenshotUrl?: string | null,
) {
  const normalizedRefs = Array.isArray(screenshotRefs)
    ? screenshotRefs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
    : [];

  if (normalizedRefs.length === 0) {
    const single = buildScreenshotAttachment(null, screenshotUrl);
    return single.screenshotUrl
      ? [single]
      : [];
  }

  return normalizedRefs.map((ref, index) => (
    buildScreenshotAttachment(ref, index === 0 ? screenshotUrl : null)
  ));
}

export function resolveToolOutputCorrelationId(
  payload: ToolOutputPayload | null | undefined,
  eventId?: string | null,
) {
  return resolveSharedToolOutputCorrelationId(payload, eventId);
}

export function resolveToolCallCorrelationId(
  payload: ToolCallPayload | null | undefined,
) {
  return resolveSharedToolCallCorrelationId(payload);
}

export function resolveErrorText(payload: ErrorPayload | null | undefined): string {
  const content = payload?.content;
  if (typeof content === 'string' && content.length > 0) {
    return content;
  }
  const message = payload?.message;
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  return 'An error occurred';
}
