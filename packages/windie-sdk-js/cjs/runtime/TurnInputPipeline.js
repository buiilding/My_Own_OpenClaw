/**
 * Provides the turn input pipeline module for the committed JavaScript SDK runtime.
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTurnInputResources = resolveTurnInputResources;
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
function optionalStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        .map(entry => entry.trim());
}
function mergeAttachmentContext(existing, incoming) {
    const existingText = optionalString(existing);
    const incomingText = optionalString(incoming);
    if (!incomingText) {
        return existingText;
    }
    if (!existingText) {
        return incomingText;
    }
    return `${existingText}\n\n${incomingText}`;
}
function mergeStringArray(existing, incoming) {
    const values = new Set([
        ...optionalStringArray(existing),
        ...optionalStringArray(incoming),
    ]);
    return values.size > 0 ? Array.from(values) : null;
}
function errorMessage(error) {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    if (typeof error === 'string' && error.trim()) {
        return error;
    }
    return 'Unknown turn resource resolution error';
}
function applyResolution(target, resolution) {
    const attachmentContext = mergeAttachmentContext(target.attachment_context, resolution.attachmentContext);
    if (attachmentContext) {
        target.attachment_context = attachmentContext;
    }
    const attachmentFilenames = mergeStringArray(target.attachment_filenames, resolution.attachmentFilenames);
    if (attachmentFilenames) {
        target.attachment_filenames = attachmentFilenames;
    }
    const screenshot = optionalString(resolution.screenshot);
    if (screenshot) {
        target.screenshot = screenshot;
    }
    const screenshotRef = optionalString(resolution.screenshotRef);
    if (screenshotRef) {
        target.screenshot_ref = screenshotRef;
    }
    const screenshotUrl = optionalString(resolution.screenshotUrl);
    if (screenshotUrl) {
        target.screenshot_url = screenshotUrl;
    }
    const screenshotRefs = mergeStringArray(target.screenshot_refs, resolution.screenshotRefs);
    if (screenshotRefs) {
        target.screenshot_refs = screenshotRefs;
    }
    if (isJsonRecord(resolution.captureMeta)) {
        target.capture_meta = {
            ...(isJsonRecord(target.capture_meta) ? target.capture_meta : {}),
            ...resolution.captureMeta,
        };
    }
    const workspacePath = optionalString(resolution.workspacePath);
    if (workspacePath) {
        target.workspace_path = workspacePath;
    }
}
function resourceRequired(resource) {
    return resource.required === true;
}
async function resolveTurnInputResources(input) {
    const resources = Array.isArray(input.resources) ? input.resources : [];
    const resolvers = input.resolvers ?? {};
    const payload = {};
    const metadata = {};
    const failures = [];
    for (const resource of resources) {
        const resolver = resolvers[resource.kind];
        if (!resolver) {
            failures.push({
                kind: resource.kind,
                message: `No resolver registered for ${resource.kind}`,
                fatal: resourceRequired(resource),
            });
            continue;
        }
        let resolution;
        try {
            resolution = await resolver(resource, input.context);
        }
        catch (error) {
            failures.push({
                kind: resource.kind,
                message: errorMessage(error),
                fatal: resourceRequired(resource),
            });
            continue;
        }
        if (!resolution) {
            continue;
        }
        applyResolution(payload, resolution);
        if (isJsonRecord(resolution.metadata)) {
            Object.assign(metadata, resolution.metadata);
        }
        const message = optionalString(resolution.error);
        if (message) {
            failures.push({
                kind: resource.kind,
                message,
                fatal: resolution.fatal === true || resourceRequired(resource),
            });
        }
    }
    if (failures.length > 0) {
        metadata.turn_resource_failures = failures.map(failure => ({
            kind: failure.kind,
            message: failure.message,
            fatal: failure.fatal,
        }));
    }
    const fatalFailure = failures.find(failure => failure.fatal);
    if (fatalFailure) {
        throw new Error(fatalFailure.message);
    }
    return {
        payload,
        metadata,
        failures,
    };
}
