import type {
  JsonRecord,
  LocalToolCall,
  LocalToolExecutionLifecycle,
  LocalToolExecutionRelease,
  LocalRuntime,
  LocalToolResult,
  TraceEventDraft,
  TurnInputResource,
  TurnResourceResolution,
  TurnResourceResolverContext,
  TurnResourceResolverRegistry,
} from '../conversation/types.js';
import type { WindieSdkClient } from '../transport/HostedBackendHttpClient.js';

const DEFAULT_SCREENSHOT_CONTENT_TYPE = 'image/jpeg';
const SCREENSHOT_CAPTURE_PATH = 'screenshot.capture';

export type DefaultTurnResourceResolverOptions = {
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool'>> | null;
  localToolLifecycle?: LocalToolExecutionLifecycle | null;
  sdkClient?: WindieSdkClient | null;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nowMs(): number {
  return Date.now();
}

function durationSince(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
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

function blobFromBytes(input: Uint8Array, contentType: string): Blob {
  const blobCtor = (globalThis as unknown as { Blob?: typeof Blob }).Blob;
  if (!blobCtor) {
    throw new Error('Blob constructor is unavailable');
  }
  const arrayBuffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
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

type NormalizedLocalToolLease = {
  release?: () => void | Promise<void>;
  trace?: JsonRecord | null;
};

type LocalToolExecutionHooks = {
  onLifecycleStart?: () => void | Promise<void>;
  onLifecycleSucceeded?: (trace: JsonRecord | null, durationMs: number) => void | Promise<void>;
  onLifecycleFailed?: (error: unknown, durationMs: number) => void | Promise<void>;
  onExecuteStart?: () => void | Promise<void>;
};

type ScreenshotTraceEvent = {
  stage: string;
  status: TraceEventDraft['status'];
  runtime?: TraceEventDraft['runtime'];
  parentSpanId?: string | null;
  requestId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  data?: JsonRecord | null;
  error?: unknown;
};

function normalizeLocalToolLease(release: LocalToolExecutionRelease): NormalizedLocalToolLease {
  if (typeof release === 'function') {
    return {
      release,
      trace: isJsonRecord(release.trace) ? release.trace : null,
    };
  }
  if (isJsonRecord(release)) {
    const releaseFn = typeof release.release === 'function'
      ? release.release as () => void | Promise<void>
      : undefined;
    return {
      ...(releaseFn ? { release: releaseFn } : {}),
      trace: isJsonRecord(release.trace) ? release.trace : null,
    };
  }
  return {};
}

async function executeLocalTool(
  options: DefaultTurnResourceResolverOptions,
  call: LocalToolCall,
  hooks: LocalToolExecutionHooks = {},
): Promise<{
  result: LocalToolResult;
  lifecycleTrace?: JsonRecord | null;
}> {
  if (!options.localRuntime?.executeTool) {
    throw new Error('local runtime executeTool is unavailable');
  }
  let lease: NormalizedLocalToolLease = {};
  if (options.localToolLifecycle?.beforeExecute) {
    const lifecycleStartedAtMs = nowMs();
    await hooks.onLifecycleStart?.();
    try {
      lease = normalizeLocalToolLease(await options.localToolLifecycle.beforeExecute(call));
      await hooks.onLifecycleSucceeded?.(lease.trace ?? null, durationSince(lifecycleStartedAtMs));
    } catch (error) {
      await hooks.onLifecycleFailed?.(error, durationSince(lifecycleStartedAtMs));
      throw error;
    }
  }
  try {
    await hooks.onExecuteStart?.();
    return {
      result: await options.localRuntime.executeTool(call),
      lifecycleTrace: lease.trace ?? null,
    };
  } finally {
    if (typeof lease.release === 'function') {
      await lease.release();
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

function emitScreenshotTrace(
  context: TurnResourceResolverContext,
  event: ScreenshotTraceEvent,
): Promise<void> | void {
  return context.emitTrace?.({
    path: SCREENSHOT_CAPTURE_PATH,
    ...event,
  });
}

function traceDataFromCaptureMeta(captureMeta: unknown): JsonRecord {
  if (!isJsonRecord(captureMeta)) {
    return {};
  }
  const virtualBounds = isJsonRecord(captureMeta.desktop_virtual_bounds)
    ? captureMeta.desktop_virtual_bounds
    : null;
  return {
    ...(typeof captureMeta.capture_engine === 'string' ? { captureEngine: captureMeta.capture_engine } : {}),
    ...(typeof captureMeta.monitor_id === 'string' ? { monitorId: captureMeta.monitor_id } : {}),
    ...(typeof captureMeta.source_w === 'number' ? { sourceW: captureMeta.source_w } : {}),
    ...(typeof captureMeta.source_h === 'number' ? { sourceH: captureMeta.source_h } : {}),
    ...(typeof captureMeta.crop_x === 'number' ? { cropX: captureMeta.crop_x } : {}),
    ...(typeof captureMeta.crop_y === 'number' ? { cropY: captureMeta.crop_y } : {}),
    ...(typeof captureMeta.crop_w === 'number' ? { cropW: captureMeta.crop_w } : {}),
    ...(typeof captureMeta.crop_h === 'number' ? { cropH: captureMeta.crop_h } : {}),
    ...(typeof virtualBounds?.x === 'number' ? { virtualX: virtualBounds.x } : {}),
    ...(typeof virtualBounds?.y === 'number' ? { virtualY: virtualBounds.y } : {}),
    ...(typeof virtualBounds?.width === 'number' ? { virtualWidth: virtualBounds.width } : {}),
    ...(typeof virtualBounds?.height === 'number' ? { virtualHeight: virtualBounds.height } : {}),
  };
}

function sidecarCaptureTraceData(data: JsonRecord): JsonRecord {
  const pathTrace = isJsonRecord(data.path_trace) ? data.path_trace : null;
  return {
    ...(pathTrace ?? {}),
    ...traceDataFromCaptureMeta(data.capture_meta),
    ...(typeof data.size === 'number' ? { byteCount: data.size } : {}),
    ...(typeof data.screenshot_content_type === 'string' ? { contentType: data.screenshot_content_type } : {}),
    hasCaptureMeta: isJsonRecord(data.capture_meta),
  };
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

function filenameFromPath(filePath: string): string | null {
  const parts = filePath.split(/[\\/]+/);
  return optionalString(parts[parts.length - 1]);
}

async function uploadScreenshotFile(
  sdkClient: WindieSdkClient | null | undefined,
  screenshotPath: string,
  contentTypeInput: unknown,
): Promise<{
  artifactId: string;
  url?: string | null;
  contentType: string;
}> {
  if (!sdkClient?.artifacts?.upload) {
    throw new Error('artifact uploader is unavailable');
  }
  const normalizedPath = optionalString(screenshotPath);
  if (!normalizedPath) {
    throw new Error('empty screenshot path');
  }
  const fsModule = 'node:fs/promises';
  const fs = await import(/* @vite-ignore */ fsModule) as {
    readFile(path: string): Promise<Uint8Array>;
    unlink(path: string): Promise<void>;
  };
  const contentType = normalizeContentType(contentTypeInput);
  const bytes = await fs.readFile(normalizedPath);
  const uploaded = await sdkClient.artifacts.upload(
    blobFromBytes(bytes, contentType),
    screenshotFilename(contentType, filenameFromPath(normalizedPath)),
  );
  try {
    await fs.unlink(normalizedPath);
  } catch {
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

function screenshotResolutionFromData(
  data: JsonRecord,
): TurnResourceResolution | null {
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
      const { result } = await executeLocalTool(options, {
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
      const resolverStartedAtMs = nowMs();
      await emitScreenshotTrace(context, {
        stage: 'resource_detected',
        status: 'succeeded',
        data: {
          resourceKind: resource.kind,
          required: resource.required === true,
          isFirstUserMessage: resource.isFirstUserMessage === true,
          reason: optionalString(resource.reason) ?? null,
          localRuntimeAvailable: Boolean(options.localRuntime?.executeTool),
          artifactUploaderAvailable: Boolean(options.sdkClient?.artifacts?.upload),
        },
      });
      await emitScreenshotTrace(context, {
        stage: 'resolver',
        status: 'started',
        data: {
          required: resource.required === true,
        },
      });

      const fail = async (error: unknown, fallbackMessage = 'Screenshot capture failed.') => {
        const message = error instanceof Error && error.message.trim()
          ? error.message
          : (typeof error === 'string' && error.trim() ? error : fallbackMessage);
        await emitScreenshotTrace(context, {
          stage: 'resolver',
          status: resource.required === true ? 'failed' : 'skipped',
          durationMs: durationSince(resolverStartedAtMs),
          data: {
            optionalFailure: resource.required !== true,
          },
          error: { code: 'screenshot_capture_failed', message },
        });
        return errorResult(resource.kind, message, resource.required === true);
      };

      let result: LocalToolResult;
      try {
        const execution = await executeLocalTool(options, {
          toolName: 'screenshot',
          args: {
            explanation: screenshotExplanation(resource),
            expectation: 'Current screen state',
          },
          turnRef: context.turnRef,
          conversationRef: context.conversationRef,
        }, {
          onLifecycleStart: async () => {
            await emitScreenshotTrace(context, {
              stage: 'surface_prepare',
              status: 'started',
              runtime: 'electron-main',
            });
          },
          onLifecycleSucceeded: async (trace, durationMs) => {
            await emitScreenshotTrace(context, {
              stage: 'surface_prepare',
              status: 'succeeded',
              runtime: 'electron-main',
              durationMs,
              data: trace ?? undefined,
            });
          },
          onLifecycleFailed: async (error, durationMs) => {
            await emitScreenshotTrace(context, {
              stage: 'surface_prepare',
              status: 'failed',
              runtime: 'electron-main',
              durationMs,
              error,
            });
          },
          onExecuteStart: async () => {
            await emitScreenshotTrace(context, {
              stage: 'sidecar_capture',
              status: 'started',
              runtime: 'sidecar',
            });
          },
        });
        result = execution.result;
      } catch (error) {
        await emitScreenshotTrace(context, {
          stage: 'sidecar_capture',
          status: 'failed',
          runtime: 'sidecar',
          error,
        });
        return fail(error);
      }

      if (result.success === false) {
        const message = optionalString(result.error) ?? 'Screenshot capture failed.';
        await emitScreenshotTrace(context, {
          stage: 'sidecar_capture',
          status: 'failed',
          runtime: 'sidecar',
          error: { code: 'sidecar_screenshot_failed', message },
        });
        return fail(message);
      }

      const data = resolveScreenshotData(result);
      await emitScreenshotTrace(context, {
        stage: 'sidecar_capture',
        status: 'succeeded',
        runtime: 'sidecar',
        data: sidecarCaptureTraceData(data),
      });

      const existing = screenshotResolutionFromData(data);
      if (existing) {
        await emitScreenshotTrace(context, {
          stage: 'artifact_upload',
          status: 'skipped',
          data: {
            uploadMode: 'existing_ref',
            hasScreenshotRef: Boolean(existing.screenshotRef),
            screenshotRefCount: Array.isArray(existing.screenshotRefs) ? existing.screenshotRefs.length : 0,
          },
        });
        await emitScreenshotTrace(context, {
          stage: 'resolver',
          status: 'succeeded',
          durationMs: durationSince(resolverStartedAtMs),
          data: {
            uploadMode: 'existing_ref',
            hasScreenshotRef: Boolean(existing.screenshotRef),
            hasCaptureMeta: isJsonRecord(existing.captureMeta),
          },
        });
        return existing;
      }

      try {
        const screenshotPath = stringFromRecord(data, 'screenshot_path', 'screenshotPath');
        if (screenshotPath) {
          const uploadStartedAtMs = nowMs();
          await emitScreenshotTrace(context, {
            stage: 'artifact_upload',
            status: 'started',
            data: {
              uploadMode: 'file',
              contentType: typeof data.screenshot_content_type === 'string'
                ? data.screenshot_content_type
                : null,
            },
          });
          const uploaded = await uploadScreenshotFile(
            options.sdkClient,
            screenshotPath,
            data.screenshot_content_type,
          );
          await emitScreenshotTrace(context, {
            stage: 'artifact_upload',
            status: 'succeeded',
            durationMs: durationSince(uploadStartedAtMs),
            data: {
              uploadMode: 'file',
              artifactId: uploaded.artifactId,
              contentType: uploaded.contentType,
              hasUrl: Boolean(uploaded.url),
            },
          });
          const resolution = {
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
          await emitScreenshotTrace(context, {
            stage: 'resolver',
            status: 'succeeded',
            durationMs: durationSince(resolverStartedAtMs),
            data: {
              uploadMode: 'file',
              hasScreenshotRef: true,
              screenshotRefCount: 1,
              hasCaptureMeta: isJsonRecord(data.capture_meta),
            },
          });
          return resolution;
        }

        const screenshot = stringFromRecord(data, 'screenshot');
        if (!screenshot) {
          await emitScreenshotTrace(context, {
            stage: 'resolver',
            status: 'skipped',
            durationMs: durationSince(resolverStartedAtMs),
            data: {
              reason: 'empty_screenshot_payload',
              optionalFailure: resource.required !== true,
            },
          });
          return null;
        }

        const uploadStartedAtMs = nowMs();
        await emitScreenshotTrace(context, {
          stage: 'artifact_upload',
          status: 'started',
          data: {
            uploadMode: 'inline',
            contentType: typeof data.screenshot_content_type === 'string'
              ? data.screenshot_content_type
              : null,
          },
        });
        const uploaded = await uploadScreenshotBase64(
          options.sdkClient,
          screenshot,
          data.screenshot_content_type,
        );
        await emitScreenshotTrace(context, {
          stage: 'artifact_upload',
          status: 'succeeded',
          durationMs: durationSince(uploadStartedAtMs),
          data: {
            uploadMode: 'inline',
            artifactId: uploaded.artifactId,
            contentType: uploaded.contentType,
            hasUrl: Boolean(uploaded.url),
          },
        });
        await emitScreenshotTrace(context, {
          stage: 'resolver',
          status: 'succeeded',
          durationMs: durationSince(resolverStartedAtMs),
          data: {
            uploadMode: 'inline',
            hasScreenshotRef: true,
            screenshotRefCount: 1,
            hasCaptureMeta: isJsonRecord(data.capture_meta),
          },
        });
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
      } catch (error) {
        await emitScreenshotTrace(context, {
          stage: 'artifact_upload',
          status: 'failed',
          error: {
            code: 'artifact_upload_failed',
            message: 'Screenshot artifact upload failed.',
          },
        });
        return fail('Screenshot artifact upload failed.');
      }
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
