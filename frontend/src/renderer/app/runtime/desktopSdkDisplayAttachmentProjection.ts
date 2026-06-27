/**
 * Reads SDK display attachment descriptors for renderer projection adapters.
 */

import type {
  SdkDisplayAttachment,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';

type SdkDisplayImageAttachmentSource = {
  id: string;
  status: 'ready';
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

function optionalReadyImageUrl(value: unknown): string | null {
  const url = optionalExactString(value);
  if (!url || url.toLowerCase().startsWith('data:')) {
    return null;
  }
  return url;
}

function isDisplayableImageAttachment(record: Record<string, unknown>): boolean {
  if (record.status === 'materializing') {
    return (
      record.source === 'user_included'
      && optionalExactString(record.previewSrc) !== null
    );
  }
  if (record.status === 'ready') {
    return (
      optionalExactString(record.screenshotRef) !== null
      || optionalReadyImageUrl(record.screenshotUrl) !== null
    );
  }
  return record.status === 'failed';
}

function isDisplayableScreenshotRequestAttachment(record: Record<string, unknown>): boolean {
  return (
    record.source === 'camera_button'
    && (
      record.status === 'pending_capture'
      || record.status === 'materializing'
      || record.status === 'failed'
    )
  );
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
    )
    && (
      record.kind === 'image'
        ? isDisplayableImageAttachment(record)
        : isDisplayableScreenshotRequestAttachment(record)
    ),
  );
}

function readSdkDisplayAttachments(value: unknown): SdkDisplayAttachment[] {
  return Array.isArray(value) ? value.filter(isSdkDisplayAttachment) : [];
}

function isReadyDisplayImageAttachment(value: unknown): boolean {
  const record = recordFromUnknown(value);
  return Boolean(
    record
    && record.kind === 'image'
    && record.status === 'ready',
  );
}

function readSdkImageAttachmentSource(value: unknown): SdkDisplayImageAttachmentSource | null {
  if (!isSdkDisplayAttachment(value) || !isReadyDisplayImageAttachment(value)) {
    return null;
  }
  return {
    id: value.id,
    status: 'ready',
    artifactId: optionalExactString(value.screenshotRef),
    url: optionalReadyImageUrl(value.screenshotUrl),
    contentType: optionalExactString(value.contentType),
  };
}

export const DesktopSdkDisplayAttachmentProjection = Object.freeze({
  readSdkImageAttachmentSource,
  readSdkDisplayAttachments,
});
