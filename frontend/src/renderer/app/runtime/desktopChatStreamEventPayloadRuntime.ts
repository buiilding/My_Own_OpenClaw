/**
 * Normalizes renderer chat stream event payloads for UI side effects.
 */

import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const RECOVERABLE_TOOL_PARSE_ERROR_MARKERS = [
  'failed to parse streamed tool-call arguments',
  'raw arguments preview:',
];

type ErrorPayload = {
  message?: unknown;
  content?: unknown;
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
  return DesktopArtifactRuntimeClient.buildRemoteScreenshotAttachment(screenshotRef, screenshotUrl);
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
