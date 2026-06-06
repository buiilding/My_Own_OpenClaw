import type {
  JsonRecord,
  LocalToolCall,
  LocalToolExecutionLifecycle,
  LocalRuntime,
  LocalToolResult,
  TurnInputResource,
  TurnResourceResolution,
  TurnResourceResolverContext,
  TurnResourceResolverRegistry,
} from '../conversation/types.js';
import type { WindieSdkClient } from '../transport/HostedBackendHttpClient.js';

const DEFAULT_SCREENSHOT_CONTENT_TYPE = 'image/jpeg';

export type DefaultTurnResourceResolverOptions = {
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool'>> | null;
  localToolLifecycle?: LocalToolExecutionLifecycle | null;
  sdkClient?: WindieSdkClient | null;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function stringFromRecord(record: JsonRecord | null, ...keys: string[]): string | null {
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

function normalizeContentType(value: unknown, fallback = DEFAULT_SCREENSHOT_CONTENT_TYPE): string {
  const normalized = typeof value === 'string'
    ? value.split(';', 1)[0]?.trim().toLowerCase()
    : '';
  return normalized || fallback;
}

function screenshotFilename(contentType: string, filename?: string | null): string {
  const normalizedFilename = optionalString(filename);
  if (normalizedFilename) {
    return normalizedFilename;
  }
  return contentType === 'image/png' ? 'user-message.png' : 'user-message.jpg';
}

function stripDataUrlPrefix(input: string, contentType?: string | null): { base64: string; contentType: string } {
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
function base64ToBytes(base64: string): Uint8Array {
  const atobImpl = (globalThis as unknown as { atob?: (input: string) => string }).atob;
  if (typeof atobImpl === 'function') {
    const binary = atobImpl(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  const bufferCtor = (globalThis as unknown as {
    Buffer?: { from(input: string, encoding: 'base64'): Uint8Array };
  }).Buffer;
  if (bufferCtor?.from) {
    return bufferCtor.from(base64, 'base64');
  }
  throw new Error('base64 decoder is unavailable');
}

function blobFromBase64(input: string, contentType: string): Blob {
  const blobCtor = (globalThis as unknown as { Blob?: typeof Blob }).Blob;
  if (!blobCtor) {
    throw new Error('Blob constructor is unavailable');
  }
  const bytes = base64ToBytes(input);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new blobCtor([arrayBuffer], { type: contentType });
}

function errorResult(kind: TurnInputResource['kind'], error: string, fatal = false): TurnResourceResolution {
  return {
    kind,
    error,
    fatal,
  };
}

async function executeLocalTool(
  options: DefaultTurnResourceResolverOptions,
  call: LocalToolCall,
): Promise<LocalToolResult> {
  if (!options.localRuntime?.executeTool) {
    throw new Error('local runtime executeTool is unavailable');
  }
  const release = await options.localToolLifecycle?.beforeExecute?.(call);
  try {
    return await options.localRuntime.executeTool(call);
  } finally {
    if (typeof release === 'function') {
      await release();
    }
  }
}

function resolveReadFileOutput(result: LocalToolResult): string | null {
  const data = isJsonRecord(result.data) ? result.data : null;
  return stringFromRecord(data, 'output', 'content');
}

function resolveScreenshotData(result: LocalToolResult): JsonRecord {
  return isJsonRecord(result.data) ? result.data : {};
}

async function uploadScreenshotBase64(
  sdkClient: WindieSdkClient | null | undefined,
  screenshot: string,
  contentTypeInput: unknown,
  filename?: string | null,
): Promise<{
  artifactId: string;
  url?: string | null;
  contentType: string;
}> {
  if (!sdkClient?.artifacts?.upload) {
    throw new Error('artifact uploader is unavailable');
  }
  const parsed = stripDataUrlPrefix(screenshot, typeof contentTypeInput === 'string' ? contentTypeInput : null);
  if (!parsed.base64) {
    throw new Error('empty screenshot bytes');
  }
  const uploaded = await sdkClient.artifacts.upload(
    blobFromBase64(parsed.base64, parsed.contentType),
    screenshotFilename(parsed.contentType, filename),
  );
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

function screenshotResolutionFromData(
  data: JsonRecord,
): TurnResourceResolution | null {
  const screenshotRef = stringFromRecord(data, 'screenshot_ref', 'screenshotRef');
  const screenshotUrl = stringFromRecord(data, 'screenshot_url', 'screenshotUrl');
  const captureMeta = isJsonRecord(data.capture_meta) ? data.capture_meta : null;
  if (!screenshotRef && !screenshotUrl && !captureMeta) {
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

function screenshotExplanation(resource: Extract<TurnInputResource, { kind: 'query_screenshot_request' }>): string {
  const reason = optionalString(resource.reason);
  if (reason) {
    return reason;
  }
  return resource.isFirstUserMessage
    ? 'Initial user request screen context'
    : 'Current screen state';
}

export function createDefaultTurnResourceResolvers(
  options: DefaultTurnResourceResolverOptions,
): TurnResourceResolverRegistry {
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
      const uploaded = await uploadScreenshotBase64(
        options.sdkClient,
        resource.base64,
        resource.contentType,
        resource.filename,
      );
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
        return errorResult(
          resource.kind,
          optionalString(result.error) ?? 'Screenshot capture failed.',
          resource.required === true,
        );
      }
      const data = resolveScreenshotData(result);
      const existing = screenshotResolutionFromData(data);
      if (existing) {
        return existing;
      }
      const screenshot = stringFromRecord(data, 'screenshot');
      if (!screenshot) {
        return null;
      }
      const uploaded = await uploadScreenshotBase64(
        options.sdkClient,
        screenshot,
        data.screenshot_content_type,
      );
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
