import { buildArtifactUrl } from '../../../infrastructure/services/ArtifactUploader';

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';

type ErrorPayload = {
  message?: unknown;
  content?: unknown;
};

type ToolOutputPayload = {
  request_id?: string | null;
  metadata?: unknown;
};

export function shouldIgnoreStreamError(payload: ErrorPayload | null | undefined): boolean {
  const message = payload?.message;
  const content = payload?.content;
  return (
    (typeof message === 'string' && message.includes(SETTINGS_UPDATE_ERROR_TEXT))
    || (typeof content === 'string' && content.includes(SETTINGS_UPDATE_ERROR_TEXT))
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

export function resolveToolOutputCorrelationId(
  payload: ToolOutputPayload | null | undefined,
  eventId?: string | null,
) {
  return payload?.request_id
    || (typeof payload?.metadata === 'object' ? (payload?.metadata as any)?.request_id : undefined)
    || eventId
    || undefined;
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
