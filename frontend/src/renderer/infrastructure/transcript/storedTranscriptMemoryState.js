/**
 * Stores and retrieves stored transcript memory state state for the renderer UI.
 */

import {
  normalizeMessageType,
  normalizeOptionalString,
  normalizeTranscriptTransparency,
} from './rehydratePayload';
import {
  readStructuredToolPayload,
} from './structuredToolPayload';
import {
  resolveScreenshotAttachmentState,
} from '../services/screenshotMessageState';

function resolveStoredMemoryMetadata(memory) {
  if (!memory || typeof memory !== 'object') {
    return {};
  }
  const metadata = memory.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

export function resolveStoredTranscriptScreenshotAttachment(memory) {
  const metadata = resolveStoredMemoryMetadata(memory);
  const recordKind = normalizeOptionalString(
    memory?.record_kind
      || memory?.recordKind
      || metadata.record_kind
      || metadata.recordKind,
  );

  return resolveScreenshotAttachmentState({
    screenshot: memory?.screenshot || metadata.screenshot || null,
    screenshotRef: (
      memory?.screenshot_ref
      || memory?.screenshotRef
      || metadata.screenshot_ref
      || metadata.screenshotRef
      || null
    ),
    screenshotUrl: (
      memory?.screenshot_url
      || memory?.screenshotUrl
      || metadata.screenshot_url
      || metadata.screenshotUrl
      || null
    ),
    screenshotContentType: (
      memory?.screenshot_content_type
      || memory?.screenshotContentType
      || metadata.screenshot_content_type
      || metadata.screenshotContentType
      || null
    ),
    inferArtifactRefFromScreenshot: recordKind === 'transcript',
    preserveInlineScreenshotWithRemote: true,
    deriveUrlFromRef: false,
  });
}

export function resolveStoredTranscriptMemoryState(memory) {
  const metadata = resolveStoredMemoryMetadata(memory);
  const role = normalizeOptionalString(memory?.role || metadata.role) || null;
  const messageType = normalizeOptionalString(
    memory?.message_type
      || memory?.messageType
      || metadata.message_type
      || metadata.messageType,
  ) || null;

  return {
    metadata,
    rawContent: typeof memory?.content === 'string' ? memory.content : '',
    role,
    messageType,
    normalizedMessageType: normalizeMessageType(messageType),
    modelProvider: normalizeOptionalString(
      memory?.model_provider
        || memory?.modelProvider
        || metadata.model_provider
        || metadata.modelProvider,
    ),
    modelId: normalizeOptionalString(
      memory?.model_id
        || memory?.modelId
        || metadata.model_id
        || metadata.modelId,
    ),
    correlationId: normalizeOptionalString(
      memory?.correlation_id
        || memory?.correlationId
        || metadata.correlation_id
        || metadata.correlationId,
    ),
    toolName: normalizeOptionalString(
      memory?.tool_name
        || memory?.toolName
        || metadata.tool_name
        || metadata.toolName,
    ),
    toolCallId: normalizeOptionalString(
      memory?.tool_call_id
        || memory?.toolCallId
        || metadata.tool_call_id
        || metadata.toolCallId,
    ),
    timestamp: normalizeOptionalString(memory?.timestamp) || null,
    structuredToolPayload: readStructuredToolPayload(
      memory?.structured_payload,
      memory?.structuredPayload,
      metadata.structured_payload,
      metadata.structuredPayload,
    ),
    transparency: normalizeTranscriptTransparency(metadata.transparency),
    screenshotAttachment: resolveStoredTranscriptScreenshotAttachment(memory),
  };
}
