/**
 * Reads SDK display attachment descriptors for renderer projection adapters.
 */

import type {
  SdkDisplayAttachment,
  SdkDisplayAttachmentSource,
  SdkDisplayAttachmentStatus,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';

type SdkDisplayImageAttachmentSource = {
  id: string;
  status: 'ready';
  artifactId: string | null;
  url: string | null;
  contentType: string | null;
};

type SdkDisplayAttachmentKind = SdkDisplayAttachment['kind'];

const SDK_DISPLAY_ATTACHMENT_KINDS = new Set<SdkDisplayAttachmentKind>([
  'image',
  'screenshot_request',
]);
const SDK_DISPLAY_ATTACHMENT_SOURCES = new Set<SdkDisplayAttachmentSource>([
  'user_included',
  'camera_button',
  'tool_result',
  'replay',
]);
const SDK_DISPLAY_ATTACHMENT_STATUSES = new Set<SdkDisplayAttachmentStatus>([
  'materializing',
  'pending_capture',
  'ready',
  'failed',
]);

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

function optionalAttachmentString(value: unknown): string | null {
  return optionalExactString(value);
}

function readExactAttachmentKind(value: unknown): SdkDisplayAttachmentKind | null {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && SDK_DISPLAY_ATTACHMENT_KINDS.has(value as SdkDisplayAttachmentKind)
    ? value as SdkDisplayAttachmentKind
    : null;
}

function readExactAttachmentSource(value: unknown): SdkDisplayAttachmentSource | null {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && SDK_DISPLAY_ATTACHMENT_SOURCES.has(value as SdkDisplayAttachmentSource)
    ? value as SdkDisplayAttachmentSource
    : null;
}

function readExactAttachmentStatus(value: unknown): SdkDisplayAttachmentStatus | null {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && SDK_DISPLAY_ATTACHMENT_STATUSES.has(value as SdkDisplayAttachmentStatus)
    ? value as SdkDisplayAttachmentStatus
    : null;
}

function isDisplayableImageAttachment(record: Record<string, unknown>): boolean {
  const source = readExactAttachmentSource(record.source);
  const status = readExactAttachmentStatus(record.status);
  if (status === 'materializing') {
    return (
      source === 'user_included'
      && optionalExactString(record.previewSrc) !== null
    );
  }
  if (status === 'ready') {
    return (
      optionalExactString(record.screenshotRef) !== null
      || optionalReadyImageUrl(record.screenshotUrl) !== null
    );
  }
  return status === 'failed';
}

function isDisplayableScreenshotRequestAttachment(record: Record<string, unknown>): boolean {
  const source = readExactAttachmentSource(record.source);
  const status = readExactAttachmentStatus(record.status);
  return (
    source === 'camera_button'
    && (
      status === 'pending_capture'
      || status === 'materializing'
      || status === 'failed'
    )
  );
}

function baseAttachmentFields(record: Record<string, unknown>): Pick<
  SdkDisplayAttachment,
  'id' | 'kind' | 'source' | 'status'
> | null {
  const id = optionalExactString(record.id);
  const kind = readExactAttachmentKind(record.kind);
  const source = readExactAttachmentSource(record.source);
  const status = readExactAttachmentStatus(record.status);
  if (
    !id
    || !kind
    || !source
    || !status
  ) {
    return null;
  }
  return {
    id,
    kind,
    source,
    status,
  };
}

function withOptionalDisplayStrings(
  attachment: SdkDisplayAttachment,
  record: Record<string, unknown>,
): SdkDisplayAttachment {
  const filename = optionalAttachmentString(record.filename);
  const contentType = optionalAttachmentString(record.contentType);
  const errorCode = optionalAttachmentString(record.errorCode);
  return {
    ...attachment,
    ...(filename ? { filename } : {}),
    ...(contentType ? { contentType } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}

function sanitizeImageAttachment(
  base: SdkDisplayAttachment,
  record: Record<string, unknown>,
): SdkDisplayAttachment | null {
  if (base.status === 'materializing') {
    if (base.source !== 'user_included') {
      return null;
    }
    const previewSrc = optionalExactString(record.previewSrc);
    return previewSrc
      ? withOptionalDisplayStrings({ ...base, previewSrc }, record)
      : null;
  }
  if (base.status === 'ready') {
    const screenshotRef = optionalExactString(record.screenshotRef);
    const screenshotUrl = optionalReadyImageUrl(record.screenshotUrl);
    if (!screenshotRef && !screenshotUrl) {
      return null;
    }
    return withOptionalDisplayStrings({
      ...base,
      ...(screenshotRef ? { screenshotRef } : {}),
      ...(screenshotUrl ? { screenshotUrl } : {}),
    }, record);
  }
  if (base.status === 'failed') {
    return withOptionalDisplayStrings(base, record);
  }
  return null;
}

function sanitizeScreenshotRequestAttachment(
  base: SdkDisplayAttachment,
  record: Record<string, unknown>,
): SdkDisplayAttachment | null {
  if (
    base.source !== 'camera_button'
    || (
      base.status !== 'pending_capture'
      && base.status !== 'materializing'
      && base.status !== 'failed'
    )
  ) {
    return null;
  }
  return withOptionalDisplayStrings(base, record);
}

function sanitizeSdkDisplayAttachment(value: unknown): SdkDisplayAttachment | null {
  const record = recordFromUnknown(value);
  if (!record) {
    return null;
  }
  const kind = readExactAttachmentKind(record.kind);
  if (!kind) {
    return null;
  }
  if (
    kind === 'image'
      ? !isDisplayableImageAttachment(record)
      : !isDisplayableScreenshotRequestAttachment(record)
  ) {
    return null;
  }
  const base = baseAttachmentFields(record);
  if (!base) {
    return null;
  }
  return base.kind === 'image'
    ? sanitizeImageAttachment(base, record)
    : sanitizeScreenshotRequestAttachment(base, record);
}

function readSdkDisplayAttachments(value: unknown): SdkDisplayAttachment[] {
  return Array.isArray(value)
    ? value.flatMap((attachment) => sanitizeSdkDisplayAttachment(attachment) ?? [])
    : [];
}

function isReadyDisplayImageAttachment(value: unknown): boolean {
  const record = recordFromUnknown(value);
  return Boolean(
    record
    && readExactAttachmentKind(record.kind) === 'image'
    && readExactAttachmentStatus(record.status) === 'ready',
  );
}

function readSdkImageAttachmentSource(value: unknown): SdkDisplayImageAttachmentSource | null {
  const attachment = sanitizeSdkDisplayAttachment(value);
  if (!isReadyDisplayImageAttachment(attachment)) {
    return null;
  }
  return {
    id: attachment.id,
    status: 'ready',
    artifactId: optionalExactString(attachment.screenshotRef),
    url: optionalReadyImageUrl(attachment.screenshotUrl),
    contentType: optionalExactString(attachment.contentType),
  };
}

export const DesktopSdkDisplayAttachmentProjection = Object.freeze({
  readSdkImageAttachmentSource,
  readSdkDisplayAttachments,
});
