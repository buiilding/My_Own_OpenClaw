/**
 * Reads SDK display attachment descriptors for renderer projection adapters.
 */

import type {
  SdkDisplayAttachment,
} from '../../../../packages/windie-sdk-js/src/conversation/types.js';

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

function optionalTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function isSdkDisplayAttachment(value: unknown): value is SdkDisplayAttachment {
  const record = recordFromUnknown(value);
  return Boolean(
    record
    && typeof record.id === 'string'
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

function isReadyDisplayImageAttachment(value: unknown): boolean {
  const record = recordFromUnknown(value);
  return Boolean(
    record
    && record.kind === 'image'
    && record.status === 'ready',
  );
}

function countDisplayImageAttachments(value: unknown): number {
  return readSdkDisplayAttachments(value).filter(isDisplayImageAttachment).length;
}

function hasReadyDisplayImageAttachment(value: unknown): boolean {
  return readSdkDisplayAttachments(value).some(isReadyDisplayImageAttachment);
}

function readSdkImageAttachmentSource(value: unknown): SdkDisplayImageAttachmentSource | null {
  if (!isSdkDisplayAttachment(value) || !isDisplayImageAttachment(value)) {
    return null;
  }
  return {
    id: value.id.trim(),
    status: value.status,
    artifactId: optionalTrimmedString(value.screenshotRef),
    url: optionalTrimmedString(value.screenshotUrl),
    contentType: optionalTrimmedString(value.contentType),
  };
}

function summarizeSdkDisplayAttachments(value: unknown): Record<string, unknown> {
  let userAttachmentCount = 0;
  let readyArtifactCount = 0;
  let materializingPreviewCount = 0;
  let pendingScreenshotRequestCount = 0;
  let failedAttachmentCount = 0;
  const sources = new Set<string>();
  const statuses = new Set<string>();
  for (const attachment of readSdkDisplayAttachments(value)) {
    const attachmentRecord = recordFromUnknown(attachment);
    if (!attachmentRecord) {
      continue;
    }
    userAttachmentCount += 1;
    if (typeof attachmentRecord.source === 'string') {
      sources.add(attachmentRecord.source);
    }
    if (typeof attachmentRecord.status === 'string') {
      statuses.add(attachmentRecord.status);
    }
    if (isReadyDisplayImageAttachment(attachmentRecord)) {
      readyArtifactCount += 1;
    } else if (attachmentRecord.status === 'materializing') {
      materializingPreviewCount += 1;
    } else if (attachmentRecord.status === 'pending_capture') {
      pendingScreenshotRequestCount += 1;
    } else if (attachmentRecord.status === 'failed') {
      failedAttachmentCount += 1;
    }
  }
  return {
    userAttachmentCount,
    attachmentSources: Array.from(sources).sort(),
    attachmentStatuses: Array.from(statuses).sort(),
    readyArtifactCount,
    materializingPreviewCount,
    pendingScreenshotRequestCount,
    failedAttachmentCount,
  };
}

export const DesktopSdkDisplayAttachmentProjection = Object.freeze({
  countDisplayImageAttachments,
  hasReadyDisplayImageAttachment,
  readSdkImageAttachmentSource,
  readSdkDisplayAttachments,
  summarizeSdkDisplayAttachments,
});
