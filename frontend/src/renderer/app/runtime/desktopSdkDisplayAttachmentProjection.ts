/**
 * Reads SDK display attachment descriptors for renderer projection adapters.
 */

import type {
  SdkDisplayAttachment,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
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

export const DesktopSdkDisplayAttachmentProjection = Object.freeze({
  readSdkDisplayAttachments,
});
