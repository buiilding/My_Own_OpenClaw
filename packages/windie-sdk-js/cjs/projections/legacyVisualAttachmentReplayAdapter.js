"use strict";
/**
 * Adapts old persisted screenshot aliases into typed display attachments.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.legacyVisualAttachmentReplayAdapter = legacyVisualAttachmentReplayAdapter;
function stringField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}
function stringArrayField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (!Array.isArray(value)) {
            continue;
        }
        const normalized = value
            .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            .map(entry => entry.trim());
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return null;
}
function attachmentSourceFor(event) {
    return event.type === 'tool_output' || event.type === 'tool_bundle_output'
        ? 'tool_result'
        : 'replay';
}
function legacyVisualAttachmentReplayAdapter(event) {
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
