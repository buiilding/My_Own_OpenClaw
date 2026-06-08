"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultTurnResourceResolvers = createDefaultTurnResourceResolvers;
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
function stringFromRecord(record, ...keys) {
    if (!record) {
        return null;
    }
    for (const key of keys) {
        const value = optionalString(record[key]);
        if (value) {
            return value;
        }
    }
    return null;
}
function normalizeContentType(value, fallback = DEFAULT_SCREENSHOT_CONTENT_TYPE) {
    const normalized = typeof value === 'string'
        ? value.split(';', 1)[0]?.trim().toLowerCase()
        : '';
    return normalized || fallback;
}
function screenshotFilename(contentType, filename) {
    const normalizedFilename = optionalString(filename);
    if (normalizedFilename) {
        return normalizedFilename;
    }
    return contentType === 'image/png' ? 'user-message.png' : 'user-message.jpg';
}
function stripDataUrlPrefix(input, contentType) {
    const match = input.match(/^data:([^;,]+);base64,(.*)$/is);
    if (!match) {
        return {
            base64: input.trim(),
            contentType: normalizeContentType(contentType),
        };
    }
    return {
        contentType: normalizeContentType(match[1] ?? contentType),
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
function errorResult(kind, error, fatal = false) {
    return {
        kind,
        error,
        fatal,
    };
}
async function executeLocalTool(options, call) {
    if (!options.localRuntime?.executeTool) {
        throw new Error('local runtime executeTool is unavailable');
    }
    const release = await options.localToolLifecycle?.beforeExecute?.(call);
    try {
        return await options.localRuntime.executeTool(call);
    }
    finally {
        if (typeof release === 'function') {
            await release();
        }
    }
}
function resolveReadFileOutput(result) {
    const data = isJsonRecord(result.data) ? result.data : null;
    return stringFromRecord(data, 'output', 'content');
}
function resolveScreenshotData(result) {
    return isJsonRecord(result.data) ? result.data : {};
}
async function uploadScreenshotBase64(sdkClient, screenshot, contentTypeInput, filename) {
    if (!sdkClient?.artifacts?.upload) {
        throw new Error('artifact uploader is unavailable');
    }
    const parsed = stripDataUrlPrefix(screenshot, typeof contentTypeInput === 'string' ? contentTypeInput : null);
    if (!parsed.base64) {
        throw new Error('empty screenshot bytes');
    }
    const uploaded = await sdkClient.artifacts.upload(blobFromBase64(parsed.base64, parsed.contentType), screenshotFilename(parsed.contentType, filename));
    const artifactId = optionalString(uploaded.artifact_id);
    if (!artifactId) {
        throw new Error('artifact upload did not return artifact_id');
    }
    return {
        artifactId,
        url: optionalString(uploaded.url) ?? sdkClient.artifacts.url?.(artifactId) ?? null,
        contentType: optionalString(uploaded.content_type) ?? parsed.contentType,
    };
}
function filenameFromPath(filePath) {
    const parts = filePath.split(/[\\/]+/);
    return optionalString(parts[parts.length - 1]);
}
async function uploadScreenshotFile(sdkClient, screenshotPath, contentTypeInput) {
    if (!sdkClient?.artifacts?.upload) {
        throw new Error('artifact uploader is unavailable');
    }
    const normalizedPath = optionalString(screenshotPath);
    if (!normalizedPath) {
        throw new Error('empty screenshot path');
    }
    const fsModule = 'node:fs/promises';
    const fs = await Promise.resolve(`${fsModule}`).then(s => __importStar(require(s)));
    const contentType = normalizeContentType(contentTypeInput);
    const bytes = await fs.readFile(normalizedPath);
    const uploaded = await sdkClient.artifacts.upload(blobFromBytes(bytes, contentType), screenshotFilename(contentType, filenameFromPath(normalizedPath)));
    try {
        await fs.unlink(normalizedPath);
    }
    catch {
        // Best effort cleanup for sidecar-owned temporary screenshot files.
    }
    const artifactId = optionalString(uploaded.artifact_id);
    if (!artifactId) {
        throw new Error('artifact upload did not return artifact_id');
    }
    return {
        artifactId,
        url: optionalString(uploaded.url) ?? sdkClient.artifacts.url?.(artifactId) ?? null,
        contentType: optionalString(uploaded.content_type) ?? contentType,
    };
}
function screenshotResolutionFromData(data) {
    const screenshotRef = stringFromRecord(data, 'screenshot_ref', 'screenshotRef');
    const screenshotUrl = stringFromRecord(data, 'screenshot_url', 'screenshotUrl');
    const captureMeta = isJsonRecord(data.capture_meta) ? data.capture_meta : null;
    if (!screenshotRef && !screenshotUrl) {
        return null;
    }
    return {
        kind: 'query_screenshot_request',
        screenshotRef,
        screenshotUrl,
        screenshotRefs: screenshotRef ? [screenshotRef] : null,
        captureMeta,
        metadata: {
            ...(screenshotRef ? { screenshotRef } : {}),
            ...(screenshotUrl ? { screenshotUrl } : {}),
        },
    };
}
function screenshotExplanation(resource) {
    const reason = optionalString(resource.reason);
    if (reason) {
        return reason;
    }
    return resource.isFirstUserMessage
        ? 'Initial user request screen context'
        : 'Current screen state';
}
function createDefaultTurnResourceResolvers(options) {
    return {
        async readable_file(resource, context) {
            if (resource.kind !== 'readable_file') {
                return null;
            }
            const result = await executeLocalTool(options, {
                toolName: 'read_file',
                args: { file_path: resource.filePath },
                turnRef: context.turnRef,
                conversationRef: context.conversationRef,
            });
            const output = resolveReadFileOutput(result);
            if (result.success === false || !output) {
                const error = optionalString(result.error) ?? 'No readable content returned.';
                return errorResult(resource.kind, error, resource.required === true);
            }
            return {
                kind: resource.kind,
                attachmentContext: `--- Attached File: ${resource.filename} ---\n${output}`,
                attachmentFilenames: [resource.filename],
            };
        },
        async clipboard_image(resource) {
            if (resource.kind !== 'clipboard_image') {
                return null;
            }
            const uploaded = await uploadScreenshotBase64(options.sdkClient, resource.base64, resource.contentType, resource.filename);
            return {
                kind: resource.kind,
                screenshotRef: uploaded.artifactId,
                screenshotUrl: uploaded.url ?? null,
                screenshotRefs: [uploaded.artifactId],
                attachmentFilenames: resource.filename ? [resource.filename] : null,
                metadata: {
                    screenshotRef: uploaded.artifactId,
                    ...(uploaded.url ? { screenshotUrl: uploaded.url } : {}),
                },
            };
        },
        async query_screenshot_request(resource, context) {
            if (resource.kind !== 'query_screenshot_request') {
                return null;
            }
            const result = await executeLocalTool(options, {
                toolName: 'screenshot',
                args: {
                    explanation: screenshotExplanation(resource),
                    expectation: 'Current screen state',
                },
                turnRef: context.turnRef,
                conversationRef: context.conversationRef,
            });
            if (result.success === false) {
                return errorResult(resource.kind, optionalString(result.error) ?? 'Screenshot capture failed.', resource.required === true);
            }
            const data = resolveScreenshotData(result);
            const existing = screenshotResolutionFromData(data);
            if (existing) {
                return existing;
            }
            const screenshotPath = stringFromRecord(data, 'screenshot_path', 'screenshotPath');
            if (screenshotPath) {
                const uploaded = await uploadScreenshotFile(options.sdkClient, screenshotPath, data.screenshot_content_type);
                return {
                    kind: resource.kind,
                    screenshotRef: uploaded.artifactId,
                    screenshotUrl: uploaded.url ?? null,
                    screenshotRefs: [uploaded.artifactId],
                    captureMeta: isJsonRecord(data.capture_meta) ? data.capture_meta : null,
                    metadata: {
                        screenshotRef: uploaded.artifactId,
                        ...(uploaded.url ? { screenshotUrl: uploaded.url } : {}),
                    },
                };
            }
            const screenshot = stringFromRecord(data, 'screenshot');
            if (!screenshot) {
                return null;
            }
            const uploaded = await uploadScreenshotBase64(options.sdkClient, screenshot, data.screenshot_content_type);
            return {
                kind: resource.kind,
                screenshotRef: uploaded.artifactId,
                screenshotUrl: uploaded.url ?? null,
                screenshotRefs: [uploaded.artifactId],
                captureMeta: isJsonRecord(data.capture_meta) ? data.capture_meta : null,
                metadata: {
                    screenshotRef: uploaded.artifactId,
                    ...(uploaded.url ? { screenshotUrl: uploaded.url } : {}),
                },
            };
        },
        async workspace(resource) {
            if (resource.kind !== 'workspace') {
                return null;
            }
            return {
                kind: resource.kind,
                workspacePath: resource.workspacePath,
            };
        },
    };
}
