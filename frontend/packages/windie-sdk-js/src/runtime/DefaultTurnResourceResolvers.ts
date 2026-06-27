/**
 * Provides the default turn resource resolvers module for the TypeScript SDK runtime.
 */

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
import type { AgentHostedBackendClient } from '../transport/HostedBackendHttpClient.js';
import {
  materializeVisualResource,
  type MaterializedVisualResource,
} from './VisualResourceMaterializer.js';

const SCREENSHOT_CAPTURE_PATH = 'screenshot.capture';

export type DefaultTurnResourceResolverOptions = {
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool'>> | null;
  localToolLifecycle?: LocalToolExecutionLifecycle | null;
  sdkClient?: AgentHostedBackendClient | null;
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

function emitArtifactUploadTrace(
  context: TurnResourceResolverContext,
  event: Omit<ScreenshotTraceEvent, 'path'>,
): Promise<void> | void {
  return context.emitTrace?.({
    path: 'artifact.upload',
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

function localRuntimeCaptureTraceData(data: JsonRecord): JsonRecord {
  const pathTrace = isJsonRecord(data.path_trace) ? data.path_trace : null;
  return {
    ...(pathTrace ?? {}),
    ...traceDataFromCaptureMeta(data.capture_meta),
    ...(typeof data.size === 'number' ? { byteCount: data.size } : {}),
    ...(typeof data.screenshot_content_type === 'string' ? { contentType: data.screenshot_content_type } : {}),
    hasCaptureMeta: isJsonRecord(data.capture_meta),
  };
}

function screenshotResolutionFromMaterialized(
  resource: Extract<TurnInputResource, { kind: 'clipboard_image' | 'query_screenshot_request' }>,
  materialized: MaterializedVisualResource | null,
): TurnResourceResolution | null {
  if (!materialized) {
    return null;
  }
  const displayAttachmentId = optionalString(resource.displayAttachmentId);
  const screenshotRef = materialized.screenshot_ref ?? null;
  const screenshotUrl = materialized.screenshot_url ?? null;
  const filename = resource.kind === 'clipboard_image' ? optionalString(resource.filename) : null;
  const contentType = optionalString(materialized.screenshot_content_type)
    ?? (resource.kind === 'clipboard_image' ? optionalString(resource.contentType) : null);
  return {
    kind: resource.kind,
    screenshotRef,
    screenshotUrl,
    screenshotRefs: materialized.screenshot_refs ?? null,
    captureMeta: materialized.capture_meta ?? null,
    attachmentFilenames: materialized.attachment_filenames ?? null,
    metadata: materialized.display_metadata ?? null,
    displayAttachment: displayAttachmentId && screenshotRef
      ? {
        id: displayAttachmentId,
        kind: 'image',
        source: resource.kind === 'query_screenshot_request' ? 'camera_button' : 'user_included',
        status: 'ready',
        ...(filename ? { filename } : {}),
        ...(contentType ? { contentType } : {}),
        screenshotRef,
        ...(screenshotUrl ? { screenshotUrl } : {}),
      }
      : null,
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
      const materialized = await materializeVisualResource({
        source: 'user_attachment',
        base64: resource.base64,
        contentType: resource.contentType,
        filename: resource.filename,
      }, {
        artifactUploader: options.sdkClient?.artifacts,
      });
      return screenshotResolutionFromMaterialized(resource, materialized);
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
              stage: 'local_runtime_capture',
              status: 'started',
              runtime: 'local-runtime',
            });
          },
        });
        result = execution.result;
      } catch (error) {
        await emitScreenshotTrace(context, {
          stage: 'local_runtime_capture',
          status: 'failed',
          runtime: 'local-runtime',
          error,
        });
        return fail(error);
      }

      if (result.success === false) {
        const message = optionalString(result.error) ?? 'Screenshot capture failed.';
        await emitScreenshotTrace(context, {
          stage: 'local_runtime_capture',
          status: 'failed',
          runtime: 'local-runtime',
          error: { code: 'local_runtime_screenshot_failed', message },
        });
        return fail(message);
      }

      const data = resolveScreenshotData(result);
      await emitScreenshotTrace(context, {
        stage: 'local_runtime_capture',
        status: 'succeeded',
        runtime: 'local-runtime',
        data: localRuntimeCaptureTraceData(data),
      });

      if ('screenshotRef' in data || 'screenshotUrl' in data || 'screenshotPath' in data) {
        await emitScreenshotTrace(context, {
          stage: 'resolver',
          status: resource.required === true ? 'failed' : 'skipped',
          durationMs: durationSince(resolverStartedAtMs),
          data: {
            reason: 'camel_case_screenshot_alias_rejected',
            optionalFailure: resource.required !== true,
          },
          error: {
            code: 'screenshot_alias_rejected',
            message: 'Screenshot resources must use snake_case screenshot fields.',
          },
        });
        return errorResult(
          resource.kind,
          'Screenshot resources must use snake_case screenshot fields.',
          resource.required === true,
        );
      }

      if (stringFromRecord(data, 'screenshot_path')) {
        await emitScreenshotTrace(context, {
          stage: 'resolver',
          status: resource.required === true ? 'failed' : 'skipped',
          durationMs: durationSince(resolverStartedAtMs),
          data: {
            reason: 'trusted_temp_path_requires_main_materialization',
            optionalFailure: resource.required !== true,
          },
          error: {
            code: 'screenshot_path_not_materialized',
            message: 'Screenshot temp paths must be materialized by Electron main before SDK resource resolution.',
          },
        });
        return errorResult(
          resource.kind,
          'Screenshot temp paths must be materialized by Electron main before SDK resource resolution.',
          resource.required === true,
        );
      }

      const hasExistingRef = Boolean(
        stringFromRecord(data, 'screenshot_ref')
        || stringFromRecord(data, 'screenshot_url')
      );
      const hasInlineScreenshot = Boolean(stringFromRecord(data, 'screenshot'));
      if (!hasExistingRef && !hasInlineScreenshot) {
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
      if (!hasExistingRef) {
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
        await emitArtifactUploadTrace(context, {
          stage: 'upload',
          status: 'started',
          data: {
            uploadMode: 'inline',
            contentType: typeof data.screenshot_content_type === 'string'
              ? data.screenshot_content_type
              : null,
          },
        });
      }

      let materialized: MaterializedVisualResource | null = null;
      try {
        materialized = await materializeVisualResource({
          source: 'query_screenshot',
          data,
        }, {
          artifactUploader: options.sdkClient?.artifacts,
          rejectCamelCaseScreenshotAliases: true,
        });
      } catch (error) {
        if (!hasExistingRef) {
          await emitArtifactUploadTrace(context, {
            stage: 'upload',
            status: 'failed',
            error: {
              code: 'artifact_upload_failed',
              message: 'Screenshot artifact upload failed.',
            },
          });
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
        return fail(error);
      }

      const existing = screenshotResolutionFromMaterialized(resource, materialized);
      if (existing && materialized) {
        if (materialized.materialization_mode === 'existing_ref') {
          await emitArtifactUploadTrace(context, {
            stage: 'upload',
            status: 'skipped',
            data: {
              reason: 'existing_ref',
              hasScreenshotRef: Boolean(existing.screenshotRef),
              screenshotRefCount: Array.isArray(existing.screenshotRefs) ? existing.screenshotRefs.length : 0,
            },
          });
        } else {
          await emitArtifactUploadTrace(context, {
            stage: 'upload',
            status: 'succeeded',
            durationMs: durationSince(uploadStartedAtMs),
            data: {
              uploadMode: 'inline',
              artifactId: materialized.screenshot_ref ?? null,
              contentType: materialized.screenshot_content_type ?? null,
              hasUrl: Boolean(materialized.screenshot_url),
            },
          });
        }
        await emitScreenshotTrace(context, {
          stage: 'artifact_upload',
          status: materialized.materialization_mode === 'existing_ref' ? 'skipped' : 'succeeded',
          ...(materialized.materialization_mode === 'uploaded_inline' ? { durationMs: durationSince(uploadStartedAtMs) } : {}),
          data: {
            uploadMode: materialized.materialization_mode === 'existing_ref' ? 'existing_ref' : 'inline',
            ...(materialized.materialization_mode === 'uploaded_inline' ? {
              artifactId: materialized.screenshot_ref ?? null,
              contentType: materialized.screenshot_content_type ?? null,
              hasUrl: Boolean(materialized.screenshot_url),
            } : {}),
            hasScreenshotRef: Boolean(existing.screenshotRef),
            screenshotRefCount: Array.isArray(existing.screenshotRefs) ? existing.screenshotRefs.length : 0,
          },
        });
        await emitScreenshotTrace(context, {
          stage: 'resolver',
          status: 'succeeded',
          durationMs: durationSince(resolverStartedAtMs),
          data: {
            uploadMode: materialized.materialization_mode === 'existing_ref' ? 'existing_ref' : 'inline',
            hasScreenshotRef: Boolean(existing.screenshotRef),
            hasCaptureMeta: isJsonRecord(existing.captureMeta),
          },
        });
        return existing;
      }
      return null;
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
