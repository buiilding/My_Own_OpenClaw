/**
 * Reads SDK display attachment descriptors for renderer projection adapters.
 */

import type {
  SdkDisplayAttachment,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';

type SdkDisplayImageAttachmentSource = {
  id: string;
  status: SdkDisplayAttachment['status'];
  artifactId: string | null;
  url: string | null;
  contentType: string | null;
};

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalExactString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function isSdkDisplayAttachment(value: unknown): value is SdkDisplayAttachment {
  const record = recordFromUnknown(value);
  return Boolean(
    record
    && optionalExactString(record.id) !== null
    && (record.kind === 'image' || record.kind === 'screenshot_request')
    && (
      record.source === 'user_included'
      || record.source === 'camera_button'
      || record.source === 'tool_result'
      || record.source === 'replay'
    )
    && (
      record.status === 'materializing'
      || record.status === 'pending_capture'
      || record.status === 'ready'
      || record.status === 'failed'
    ),
  );
}

function readSdkDisplayAttachments(value: unknown): SdkDisplayAttachment[] {
  return Array.isArray(value) ? value.filter(isSdkDisplayAttachment) : [];
}

function isDisplayImageAttachment(value: unknown): boolean {
  const record = recordFromUnknown(value);
  return Boolean(
    record
    && record.kind === 'image'
    && (
      record.status === 'materializing'
      || record.status === 'ready'
    ),
  );
}

function readSdkImageAttachmentSource(value: unknown): SdkDisplayImageAttachmentSource | null {
  if (!isSdkDisplayAttachment(value) || !isDisplayImageAttachment(value)) {
    return null;
  }
  return {
    id: value.id,
    status: value.status,
    artifactId: optionalExactString(value.screenshotRef),
    url: optionalExactString(value.screenshotUrl),
    contentType: optionalExactString(value.contentType),
  };
}

export const DesktopSdkDisplayAttachmentProjection = Object.freeze({
  readSdkImageAttachmentSource,
  readSdkDisplayAttachments,
});
