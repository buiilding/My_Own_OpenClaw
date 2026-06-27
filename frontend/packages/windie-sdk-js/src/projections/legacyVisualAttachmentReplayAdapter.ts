/**
 * Adapts old persisted screenshot aliases into typed display attachments.
 */

import type {
  ConversationEvent,
  JsonRecord,
  SdkDisplayAttachment,
} from '../conversation/types.js';

function stringField(record: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function stringArrayField(record: JsonRecord, ...keys: string[]): string[] | null {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map(entry => entry.trim());
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function attachmentSourceFor(event: ConversationEvent): SdkDisplayAttachment['source'] {
  return event.type === 'tool_output' || event.type === 'tool_bundle_output'
    ? 'tool_result'
    : 'replay';
}

export function legacyVisualAttachmentReplayAdapter(
  event: ConversationEvent,
): SdkDisplayAttachment[] | null {
  // Compatibility owner: old persisted conversation replay only. Delete this
  // adapter only after stored rows are migrated to attachments/display_attachments.
  const screenshotRef = stringField(event.payload, 'screenshotRef', 'screenshot_ref');
  const screenshotRefs = stringArrayField(event.payload, 'screenshotRefs', 'screenshot_refs')
    ?? (screenshotRef ? [screenshotRef] : null);
  if (!screenshotRefs || screenshotRefs.length === 0) {
    return null;
  }
  const screenshotUrl = stringField(event.payload, 'screenshotUrl', 'screenshot_url');
  const contentType = stringField(event.payload, 'screenshotContentType', 'screenshot_content_type');
  const source = attachmentSourceFor(event);
  return screenshotRefs.map((ref, index) => ({
    id: `${event.eventId}:attachment:${index.toString().padStart(3, '0')}`,
    kind: 'image',
    source,
    status: 'ready',
    ...(contentType ? { contentType } : {}),
    screenshotRef: ref,
    ...(index === 0 && screenshotUrl ? { screenshotUrl } : {}),
  }));
}
