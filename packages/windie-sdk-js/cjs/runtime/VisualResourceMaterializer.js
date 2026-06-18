"use strict";
/**
 * Materializes SDK/main visual resources into artifact-backed screenshot fields.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNoCamelCaseScreenshotAliases = assertNoCamelCaseScreenshotAliases;
exports.extractVisualResourceScreenshotFields = extractVisualResourceScreenshotFields;
exports.materializeVisualResource = materializeVisualResource;
exports.applyMaterializedVisualResourceToData = applyMaterializedVisualResourceToData;
const DEFAULT_SCREENSHOT_CONTENT_TYPE = 'image/jpeg';
function isJsonRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function optionalString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}
function imageContentType(value, fallback = DEFAULT_SCREENSHOT_CONTENT_TYPE) {
    const normalized = typeof value === 'string'
        ? value.split(';', 1)[0]?.trim().toLowerCase()
        : '';
    return normalized.startsWith('image/') ? normalized : fallback;
}
function screenshotFilename(contentType, filename) {
    const normalizedFilename = optionalString(filename);
    if (normalizedFilename) {
        return normalizedFilename;
    }
    if (contentType === 'image/png') {
        return 'screenshot.png';
    }
    if (contentType === 'image/webp') {
        return 'screenshot.webp';
    }
    return 'screenshot.jpg';
}
function stripDataUrlPrefix(input, contentType) {
    const match = input.match(/^data:([^;,]+);base64,(.*)$/is);
    if (!match) {
        return {
            base64: input.trim(),
            contentType: imageContentType(contentType),
        };
    }
    return {
        contentType: imageContentType(match[1] ?? contentType),
        base64: match[2]?.trim() ?? '',
    };
}
function base64ToBytes(base64) {
    const atobImpl = globalThis.atob;
    if (typeof atobImpl === 'function') {
        const binary = atobImpl(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    }
    const bufferCtor = globalThis.Buffer;
    if (bufferCtor?.from) {
        return bufferCtor.from(base64, 'base64');
    }
    throw new Error('base64 decoder is unavailable');
}
function blobFromBase64(input, contentType) {
    const blobCtor = globalThis.Blob;
    if (!blobCtor) {
        throw new Error('Blob constructor is unavailable');
    }
    const bytes = base64ToBytes(input);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new blobCtor([arrayBuffer], { type: contentType });
}
function blobFromBytes(input, contentType) {
    const blobCtor = globalThis.Blob;
    if (!blobCtor) {
        throw new Error('Blob constructor is unavailable');
    }
    const arrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    return new blobCtor([arrayBuffer], { type: contentType });
}
function readScreenshotField(data, key) {
    return optionalString(data[key]);
}
function assertNoCamelCaseScreenshotAliases(data) {
    if ('screenshotRef' in data || 'screenshotUrl' in data || 'screenshotPath' in data) {
        throw new Error('Visual resources must use screenshot_ref, screenshot_url, and screenshot_path; camelCase screenshot fields are not supported.');
    }
}
function extractVisualResourceScreenshotFields(data, options = {}) {
    if (!isJsonRecord(data)) {
        return null;
    }
    if (options.rejectCamelCaseScreenshotAliases) {
        assertNoCamelCaseScreenshotAliases(data);
    }
    const screenshot = readScreenshotField(data, 'screenshot');
    const screenshotRef = readScreenshotField(data, 'screenshot_ref');
    const screenshotUrl = readScreenshotField(data, 'screenshot_url');
    if (!screenshot && !screenshotRef && !screenshotUrl) {
        return null;
    }
    return {
        ...(screenshot ? { screenshot } : {}),
        ...(screenshotRef ? { screenshot_ref: screenshotRef } : {}),
        ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
        ...(typeof data.screenshot_content_type === 'string' ? { screenshot_content_type: data.screenshot_content_type } : {}),
        ...(isJsonRecord(data.capture_meta) ? { capture_meta: data.capture_meta } : {}),
    };
}
function materializedFromArtifactRef(input) {
    const screenshotRef = optionalString(input.screenshotRef);
    const screenshotUrl = optionalString(input.screenshotUrl)
        ?? (screenshotRef ? input.artifactUploader?.url?.(screenshotRef) ?? null : null);
    if (!screenshotRef && !screenshotUrl) {
        return null;
    }
    return {
        ...(screenshotRef ? {
            screenshot_ref: screenshotRef,
            screenshot_refs: [screenshotRef],
        } : {}),
        ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
        ...(optionalString(input.contentType) ? { screenshot_content_type: optionalString(input.contentType) } : {}),
        ...(isJsonRecord(input.captureMeta) ? { capture_meta: input.captureMeta } : {}),
        ...(optionalString(input.filename) ? { attachment_filenames: [optionalString(input.filename)] } : {}),
        display_metadata: {
            ...(screenshotRef ? { screenshotRef } : {}),
            ...(screenshotUrl ? { screenshotUrl } : {}),
        },
        materialization_mode: 'existing_ref',
    };
}
async function uploadBase64Resource(input) {
    if (!input.artifactUploader?.upload) {
        throw new Error('artifact uploader is unavailable');
    }
    const parsed = stripDataUrlPrefix(input.screenshot, input.contentType);
    if (!parsed.base64) {
        throw new Error('empty screenshot bytes');
    }
    const uploaded = await input.artifactUploader.upload(blobFromBase64(parsed.base64, parsed.contentType), screenshotFilename(parsed.contentType, input.filename));
    const artifactId = optionalString(uploaded.artifact_id);
    if (!artifactId) {
        throw new Error('artifact upload did not return artifact_id');
    }
    const screenshotUrl = optionalString(uploaded.url) ?? input.artifactUploader.url?.(artifactId) ?? null;
    const contentType = optionalString(uploaded.content_type) ?? parsed.contentType;
    return {
        screenshot_ref: artifactId,
        screenshot_refs: [artifactId],
        ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
        screenshot_content_type: contentType,
        ...(isJsonRecord(input.captureMeta) ? { capture_meta: input.captureMeta } : {}),
        ...(optionalString(input.filename) ? { attachment_filenames: [optionalString(input.filename)] } : {}),
        display_metadata: {
            screenshotRef: artifactId,
            ...(screenshotUrl ? { screenshotUrl } : {}),
        },
        materialization_mode: 'uploaded_inline',
    };
}
async function uploadByteResource(input) {
    if (!input.artifactUploader?.upload) {
        throw new Error('artifact uploader is unavailable');
    }
    if (input.bytes.byteLength <= 0) {
        throw new Error('empty screenshot bytes');
    }
    const contentType = imageContentType(input.contentType);
    const uploaded = await input.artifactUploader.upload(blobFromBytes(input.bytes, contentType), screenshotFilename(contentType, input.filename));
    const artifactId = optionalString(uploaded.artifact_id);
    if (!artifactId) {
        throw new Error('artifact upload did not return artifact_id');
    }
    const screenshotUrl = optionalString(uploaded.url) ?? input.artifactUploader.url?.(artifactId) ?? null;
    const resolvedContentType = optionalString(uploaded.content_type) ?? contentType;
    return {
        screenshot_ref: artifactId,
        screenshot_refs: [artifactId],
        ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
        screenshot_content_type: resolvedContentType,
        ...(isJsonRecord(input.captureMeta) ? { capture_meta: input.captureMeta } : {}),
        ...(optionalString(input.filename) ? { attachment_filenames: [optionalString(input.filename)] } : {}),
        display_metadata: {
            screenshotRef: artifactId,
            ...(screenshotUrl ? { screenshotUrl } : {}),
        },
        materialization_mode: 'uploaded_inline',
    };
}
async function materializeVisualResource(resource, options = {}) {
    if (resource.source === 'artifact_ref') {
        return materializedFromArtifactRef({
            screenshotRef: resource.screenshotRef,
            screenshotUrl: resource.screenshotUrl,
            contentType: resource.contentType,
            captureMeta: resource.captureMeta,
            filename: resource.filename,
            artifactUploader: options.artifactUploader,
        });
    }
    if (resource.source === 'user_attachment') {
        return uploadBase64Resource({
            artifactUploader: options.artifactUploader,
            screenshot: resource.base64,
            contentType: resource.contentType,
            filename: resource.filename,
        });
    }
    if (resource.source === 'trusted_temp_screenshot_path') {
        return uploadByteResource({
            artifactUploader: options.artifactUploader,
            bytes: resource.bytes,
            contentType: resource.contentType,
            filename: resource.filename,
            captureMeta: resource.captureMeta,
        });
    }
    if (options.rejectCamelCaseScreenshotAliases) {
        assertNoCamelCaseScreenshotAliases(resource.data);
    }
    const existing = materializedFromArtifactRef({
        screenshotRef: readScreenshotField(resource.data, 'screenshot_ref'),
        screenshotUrl: readScreenshotField(resource.data, 'screenshot_url'),
        contentType: readScreenshotField(resource.data, 'screenshot_content_type'),
        captureMeta: isJsonRecord(resource.data.capture_meta) ? resource.data.capture_meta : null,
        filename: resource.filename,
        artifactUploader: options.artifactUploader,
    });
    if (existing) {
        return existing;
    }
    const screenshot = readScreenshotField(resource.data, 'screenshot');
    if (!screenshot) {
        return null;
    }
    return uploadBase64Resource({
        artifactUploader: options.artifactUploader,
        screenshot,
        contentType: readScreenshotField(resource.data, 'screenshot_content_type'),
        filename: resource.filename,
        captureMeta: isJsonRecord(resource.data.capture_meta) ? resource.data.capture_meta : null,
    });
}
function applyMaterializedVisualResourceToData(data, materialized) {
    if (!materialized) {
        return data;
    }
    const normalized = {
        ...data,
    };
    if (materialized.screenshot_ref) {
        normalized.screenshot_ref = materialized.screenshot_ref;
    }
    if (materialized.screenshot_url) {
        normalized.screenshot_url = materialized.screenshot_url;
    }
    if (materialized.screenshot_content_type) {
        normalized.screenshot_content_type = materialized.screenshot_content_type;
    }
    if (isJsonRecord(materialized.capture_meta)) {
        normalized.capture_meta = materialized.capture_meta;
    }
    delete normalized.screenshot;
    return normalized;
}
