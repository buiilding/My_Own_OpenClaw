/**
 * Provides the tool execution coordinator module for the TypeScript SDK runtime.
 */

import { createConversationEvent } from '../conversation/events.js';
import {
  applyMaterializedVisualResourceToData,
  extractVisualResourceScreenshotFields,
  materializeVisualResource,
} from '../runtime/VisualResourceMaterializer.js';
import type {
  ConversationEvent,
  ConversationStore,
  JsonRecord,
  LocalToolExecutionLifecycle,
  LocalToolExecutionRelease,
  LocalRuntime,
  LocalToolCall,
  LocalToolResult,
  ToolBundleResultPayload,
  ToolBundleStepResult,
  ToolResultPayload,
  TraceRuntime,
  TraceStatus,
  SdkDisplayAttachment,
} from '../conversation/types.js';
import { resolveModelFacingToolCallId } from './toolCorrelationIds.js';
import { normalizeLocalToolResultData } from './toolOutputContent.js';

export type ToolExecutionCoordinatorOptions = {
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool'>> | null;
  localToolLifecycle?: LocalToolExecutionLifecycle | null;
  agentDefinition?: JsonRecord | null;
  store?: Pick<ConversationStore, 'appendEvent'> | null;
  artifactUploader?: ToolResultArtifactUploader | null;
  emitTrace?: (input: ToolExecutionTraceInput) => Promise<void> | void;
  sendToolResult: (payload: ToolResultPayload) => Promise<void>;
  sendToolBundleResult: (payload: ToolBundleResultPayload) => Promise<void>;
};

export type ToolExecutionTraceInput = {
  path: string;
  stage: string;
  status: TraceStatus;
  runtime?: TraceRuntime;
  requestId?: string | null;
  durationMs?: number | null;
  data?: JsonRecord | null;
  error?: unknown;
};

export type ToolResultArtifactUploader = {
  upload: (file: Blob, filename?: string) => Promise<{
    artifact_id: string;
    content_type?: string;
    size_bytes?: number;
    sha256?: string;
    url?: string;
  }>;
  url?: (artifactId: string) => string;
};

export type ToolClaimResult = {
  claimed: boolean;
  reason?: string;
};

type ExecutedBundleStep = {
  sourceTool: JsonRecord;
  sourceToolIndex: number;
  result: ToolBundleStepResult;
};

const COMPUTER_USE_CAPTURE_TOOL_NAMES = new Set([
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'switch_window',
  'wait',
  'click',
  'type',
  'scroll',
]);
const DEFAULT_POST_ACTION_CAPTURE_WAIT_SECONDS = 2;

function failureResult(error: unknown): LocalToolResult {
  const message = errorMessage(error);
  return {
    success: false,
    error: message,
    data: {
      output: message,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function durationSince(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function browserActionFromArgs(args: JsonRecord): string | null {
  return typeof args.action === 'string' && args.action.trim()
    ? args.action.trim()
    : null;
}

function browserRuntimeData(data: JsonRecord | null | undefined): JsonRecord {
  const tabs = Array.isArray(data?.tabs) ? data.tabs : null;
  return {
    mode: typeof data?.mode === 'string' ? data.mode : null,
    scope: typeof data?.scope === 'string' ? data.scope : null,
    connected: typeof data?.connected === 'boolean' ? data.connected : null,
    tabCount: tabs ? tabs.length : null,
    hasCurrentUrl: typeof data?.url === 'string' && data.url.trim().length > 0,
  };
}

function artifactUploadError(error: unknown): Error {
  return new Error(`artifact_upload_failed: ${errorMessage(error)}`);
}

function stringPayloadField(payload: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeToolName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isExplicitScreenshotTool(toolName: unknown): boolean {
  return normalizeToolName(toolName) === 'screenshot';
}

function isCaptureWorthyTool(toolName: unknown, args: unknown): boolean {
  const normalizedToolName = normalizeToolName(toolName);
  if (COMPUTER_USE_CAPTURE_TOOL_NAMES.has(normalizedToolName)) {
    return true;
  }
  return (
    normalizedToolName === 'run_shell_command'
    && isJsonRecord(args)
    && isPositiveFiniteNumber(args.wait)
  );
}

function resolvePostActionWaitSeconds(toolName: unknown, args: unknown): number {
  const normalizedToolName = normalizeToolName(toolName);
  if (normalizedToolName === 'wait' && isJsonRecord(args) && isPositiveFiniteNumber(args.seconds)) {
    return args.seconds;
  }
  if (isJsonRecord(args) && typeof args.wait === 'number' && Number.isFinite(args.wait)) {
    return Math.max(0, args.wait);
  }
  if (normalizedToolName === 'run_shell_command' && isJsonRecord(args) && isPositiveFiniteNumber(args.wait)) {
    return args.wait;
  }
  return DEFAULT_POST_ACTION_CAPTURE_WAIT_SECONDS;
}

function delaySeconds(seconds: number): Promise<void> {
  const milliseconds = Math.max(0, seconds) * 1000;
  if (milliseconds <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function extractScreenshotDataFromData(data: unknown): JsonRecord | null {
  try {
    return extractVisualResourceScreenshotFields(data, {
      rejectCamelCaseScreenshotAliases: true,
    });
  } catch (_error) {
    throw new Error('Local tool results must use screenshot_ref and screenshot_url; camelCase screenshot fields are not supported.');
  }
}

function toolResultDisplayAttachments(
  screenshotData: JsonRecord | null,
  requestId: string | null | undefined,
): SdkDisplayAttachment[] | null {
  if (!screenshotData) {
    return null;
  }
  const screenshotRef = stringPayloadField(screenshotData, 'screenshot_ref');
  const screenshotUrl = stringPayloadField(screenshotData, 'screenshot_url');
  if (!screenshotRef && !screenshotUrl) {
    return null;
  }
  const idPrefix = requestId && requestId.trim() ? requestId.trim() : 'tool-result';
  return [{
    id: `${idPrefix}:attachment:000`,
    kind: 'image',
    source: 'tool_result',
    status: 'ready',
    ...(stringPayloadField(screenshotData, 'screenshot_content_type') ? {
      contentType: stringPayloadField(screenshotData, 'screenshot_content_type'),
    } : {}),
    ...(screenshotRef ? { screenshotRef } : {}),
    ...(screenshotUrl ? { screenshotUrl } : {}),
  }];
}

function backendDisplayAttachments(attachments: SdkDisplayAttachment[] | null): JsonRecord[] | null {
  if (!attachments || attachments.length === 0) {
    return null;
  }
  return attachments.map(attachment => ({
    id: attachment.id,
    kind: attachment.kind,
    source: attachment.source,
    status: attachment.status,
    ...(attachment.filename ? { filename: attachment.filename } : {}),
    ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
    ...(attachment.screenshotRef ? { screenshot_ref: attachment.screenshotRef } : {}),
    ...(attachment.screenshotUrl ? { screenshot_url: attachment.screenshotUrl } : {}),
    ...(attachment.errorCode ? { error_code: attachment.errorCode } : {}),
  }));
}

function mergePostActionScreenshot(data: JsonRecord, screenshotData: JsonRecord | null, sourceToolName: string): JsonRecord {
  if (!screenshotData) {
    return data;
  }
  return {
    ...data,
    ...screenshotData,
    post_action_screenshot: true,
    post_action_screenshot_tool: sourceToolName,
  };
}

function localToolCallFromEvent(event: ConversationEvent): LocalToolCall | null {
  const payload = event.payload;
  const toolName = typeof payload.toolName === 'string' ? payload.toolName : '';
  if (!toolName) {
    return null;
  }
  return {
    toolName,
    args: payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
      ? payload.args as JsonRecord
      : {},
    requestId: typeof payload.requestId === 'string' ? payload.requestId : null,
    bundleId: typeof payload.bundleId === 'string' ? payload.bundleId : null,
    toolCallId: stringPayloadField(payload, 'toolCallId')
      ?? resolveModelFacingToolCallId(payload),
    correlationId: stringPayloadField(payload, 'correlationId'),
    turnRef: event.turnRef,
    conversationRef: event.conversationRef,
  };
}

function shouldSkipLocalToolExecution(event: ConversationEvent): boolean {
  const metadata = isJsonRecord(event.payload.metadata) ? event.payload.metadata : null;
  return metadata?.skip_local_execution === true;
}

function activeClientToolNames(agentDefinition: JsonRecord | null | undefined): Set<string> | null {
  if (!agentDefinition || !isJsonRecord(agentDefinition.tools)) {
    return null;
  }
  const clientManifest = isJsonRecord(agentDefinition.tools.client_manifest)
    ? agentDefinition.tools.client_manifest
    : null;
  const tools = Array.isArray(clientManifest?.tools) ? clientManifest.tools : [];
  if (tools.length === 0) {
    return null;
  }
  const names = tools
    .map(tool => (isJsonRecord(tool) && typeof tool.name === 'string' ? tool.name.trim() : ''))
    .filter(Boolean);
  return names.length > 0 ? new Set(names) : null;
}

function resolveLocalToolRelease(release: LocalToolExecutionRelease): (() => void | Promise<void>) | null {
  if (typeof release === 'function') {
    return release;
  }
  if (isJsonRecord(release) && typeof release.release === 'function') {
    return release.release as () => void | Promise<void>;
  }
  return null;
}

export class ToolExecutionCoordinator {
  constructor(private readonly options: ToolExecutionCoordinatorOptions) {}

  private async executeLocalTool(call: LocalToolCall): Promise<LocalToolResult> {
    if (!this.options.localRuntime?.executeTool) {
      throw new Error('local runtime executeTool is unavailable');
    }
    const activeToolNames = activeClientToolNames(this.options.agentDefinition ?? null);
    if (activeToolNames && !activeToolNames.has(call.toolName)) {
      throw new Error(
        `Local tool route unavailable for ${call.toolName}. The active capability manifest no longer exposes this tool.`,
      );
    }
    const release = resolveLocalToolRelease(await this.options.localToolLifecycle?.beforeExecute?.(call));
    try {
      return await this.options.localRuntime.executeTool(call);
    } finally {
      if (release) {
        await release();
      }
    }
  }

  private async materializeScreenshotArtifact(data: JsonRecord): Promise<JsonRecord> {
    if ('screenshotRef' in data || 'screenshotUrl' in data || 'screenshotPath' in data) {
      throw new Error('Local tool results must use screenshot_ref and screenshot_url; camelCase screenshot fields are not supported.');
    }
    const visualFields = extractVisualResourceScreenshotFields(data, {
      rejectCamelCaseScreenshotAliases: true,
    });
    if (!visualFields) {
      return data;
    }

    try {
      const materialized = await materializeVisualResource({
        source: 'tool_screenshot',
        data,
      }, {
        artifactUploader: this.options.artifactUploader,
        rejectCamelCaseScreenshotAliases: true,
      });
      return applyMaterializedVisualResourceToData(data, materialized);
    } catch (error) {
      throw artifactUploadError(error);
    }
  }

  private async materializeBundleStepScreenshots(stepResult: ToolBundleStepResult): Promise<ToolBundleStepResult> {
    if (!isJsonRecord(stepResult.output)) {
      return stepResult;
    }
    const output = await this.materializeScreenshotArtifact(stepResult.output);
    if (output === stepResult.output) {
      return stepResult;
    }
    return {
      ...stepResult,
      output,
    };
  }

  private async materializeBundleScreenshots(payload: ToolBundleResultPayload): Promise<ToolBundleResultPayload> {
    const materialized: ToolBundleResultPayload = {
      ...payload,
      step_results: await Promise.all(
        payload.step_results.map(step => this.materializeBundleStepScreenshots(step)),
      ),
    };
    const topLevel = await this.materializeScreenshotArtifact(materialized as unknown as JsonRecord);
    const nextPayload: ToolBundleResultPayload = {
      ...materialized,
      step_results: materialized.step_results,
    };
    if (typeof topLevel.screenshot === 'string') {
      nextPayload.screenshot = topLevel.screenshot;
    } else {
      delete nextPayload.screenshot;
    }
    if (typeof topLevel.screenshot_ref === 'string') {
      nextPayload.screenshot_ref = topLevel.screenshot_ref;
    }
    if (typeof topLevel.screenshot_url === 'string') {
      nextPayload.screenshot_url = topLevel.screenshot_url;
    }
    if (typeof topLevel.screenshot_content_type === 'string') {
      nextPayload.screenshot_content_type = topLevel.screenshot_content_type;
    }
    if (isJsonRecord(topLevel.capture_meta)) {
      nextPayload.capture_meta = topLevel.capture_meta;
    }
    if (isJsonRecord(topLevel.system_state)) {
      nextPayload.system_state = topLevel.system_state;
    }
    if (typeof topLevel.error === 'string') {
      nextPayload.error = topLevel.error;
    }
    return nextPayload;
  }

  private async capturePostActionScreenshot({
    waitSeconds,
    explanation,
    turnRef,
    conversationRef,
  }: {
    waitSeconds: number;
    explanation: string;
    turnRef?: string | null;
    conversationRef?: string | null;
  }): Promise<JsonRecord | null> {
    if (!this.options.localRuntime?.executeTool) {
      return null;
    }
    await delaySeconds(waitSeconds);
    try {
      const result = await this.executeLocalTool({
        toolName: 'screenshot',
        args: {
          explanation,
          wait: 0,
        },
        turnRef,
        conversationRef,
      });
      if (result.success === false) {
        return null;
      }
      return extractScreenshotDataFromData(result.data);
    } catch (_error) {
      return null;
    }
  }

  private async attachSinglePostActionScreenshot(call: LocalToolCall, result: LocalToolResult): Promise<JsonRecord> {
    const data = normalizeLocalToolResultData(result.data);
    if (
      isExplicitScreenshotTool(call.toolName)
      || !isCaptureWorthyTool(call.toolName, call.args)
      || extractScreenshotDataFromData(data)
    ) {
      return data;
    }
    const screenshotData = await this.capturePostActionScreenshot({
      waitSeconds: resolvePostActionWaitSeconds(call.toolName, call.args),
      explanation: `Capturing the screen after ${call.toolName} execution.`,
      turnRef: call.turnRef,
      conversationRef: call.conversationRef,
    });
    return mergePostActionScreenshot(data, screenshotData, call.toolName);
  }

  private resolveBundleCaptureWaitSeconds(executedSteps: ExecutedBundleStep[]): number {
    let waitSeconds = 0;
    for (const { sourceTool: tool, result } of executedSteps) {
      if (result.status !== 'ok') {
        continue;
      }
      const args = isJsonRecord(tool.args) ? tool.args : {};
      if (isCaptureWorthyTool(tool.name, args)) {
        waitSeconds = Math.max(waitSeconds, resolvePostActionWaitSeconds(tool.name, args));
      }
    }
    return waitSeconds;
  }

  private bundleContainsCaptureWorthyTool(executedSteps: ExecutedBundleStep[]): boolean {
    return executedSteps.some(({ sourceTool: tool, result }) => {
      const args = isJsonRecord(tool.args) ? tool.args : {};
      return result.status === 'ok' && isCaptureWorthyTool(tool.name, args);
    });
  }

  private findBundleScreenshotFromExplicitStep(executedSteps: ExecutedBundleStep[]): JsonRecord | null {
    for (let index = executedSteps.length - 1; index >= 0; index -= 1) {
      const { sourceTool: tool, result } = executedSteps[index];
      if (!isExplicitScreenshotTool(tool.name) || result.status !== 'ok') {
        continue;
      }
      const screenshotData = extractScreenshotDataFromData(result.output);
      if (screenshotData) {
        return screenshotData;
      }
    }
    return null;
  }

  private async attachBundlePostActionScreenshot({
    executedSteps,
    resultPayload,
    turnRef,
    conversationRef,
  }: {
    executedSteps: ExecutedBundleStep[];
    resultPayload: ToolBundleResultPayload;
    turnRef?: string | null;
    conversationRef?: string | null;
  }): Promise<ToolBundleResultPayload> {
    if (extractScreenshotDataFromData(resultPayload)) {
      return resultPayload;
    }
    const explicitScreenshot = this.findBundleScreenshotFromExplicitStep(executedSteps);
    if (explicitScreenshot) {
      return {
        ...resultPayload,
        ...explicitScreenshot,
      };
    }
    if (!this.bundleContainsCaptureWorthyTool(executedSteps)) {
      return resultPayload;
    }
    const screenshotData = await this.capturePostActionScreenshot({
      waitSeconds: this.resolveBundleCaptureWaitSeconds(executedSteps),
      explanation: 'Capturing the screen after bundled computer-use execution.',
      turnRef,
      conversationRef,
    });
    if (!screenshotData) {
      return resultPayload;
    }
    return {
      ...resultPayload,
      ...screenshotData,
    };
  }

  canClaim(event: ConversationEvent): ToolClaimResult {
    if (!this.options.localRuntime?.executeTool) {
      return { claimed: false, reason: 'missing-local-runtime' };
    }
    if (event.type !== 'tool_call' && event.type !== 'tool_bundle_call') {
      return { claimed: false, reason: 'not-tool-event' };
    }
    if (event.type === 'tool_call') {
      const call = localToolCallFromEvent(event);
      if (!call?.toolName || !call.requestId) {
        return { claimed: false, reason: 'missing-tool-name-or-request-id' };
      }
    }
    if (event.type === 'tool_bundle_call') {
      const bundleId = typeof event.payload.bundleId === 'string' ? event.payload.bundleId : '';
      if (!bundleId || !Array.isArray(event.payload.tools)) {
        return { claimed: false, reason: 'missing-bundle-id-or-tools' };
      }
    }
    return { claimed: true };
  }

  async execute(event: ConversationEvent): Promise<ToolClaimResult> {
    if (shouldSkipLocalToolExecution(event)) {
      return { claimed: true, reason: 'backend-skipped-local-execution' };
    }
    const claim = this.canClaim(event);
    if (!claim.claimed) {
      return claim;
    }
    if (event.type === 'tool_bundle_call') {
      await this.executeBundle(event);
      return claim;
    }
    await this.executeSingle(event);
    return claim;
  }

  private async executeSingle(event: ConversationEvent): Promise<void> {
    const call = localToolCallFromEvent(event);
    if (!call?.requestId || !this.options.localRuntime?.executeTool) {
      return;
    }
    const startedAt = Date.now();
    await this.options.emitTrace?.({
      path: 'tool.execution',
      stage: 'single_tool',
      status: 'started',
      runtime: 'sdk',
      requestId: call.requestId,
      data: {
        toolName: call.toolName,
        hasToolCallId: Boolean(call.toolCallId),
        hasCorrelationId: Boolean(call.correlationId),
        argsKeyCount: Object.keys(call.args).length,
      },
    });
    if (call.toolName === 'browser') {
      await this.options.emitTrace?.({
        path: 'browser.runtime',
        stage: 'action',
        status: 'started',
        runtime: 'local-runtime',
        requestId: call.requestId,
        data: {
          action: browserActionFromArgs(call.args),
          argsKeyCount: Object.keys(call.args).length,
        },
      });
    }
    let result: LocalToolResult;
    try {
      result = await this.executeLocalTool(call);
    } catch (error) {
      result = failureResult(error);
    }
    const success = result.success !== false;
    let payload: ToolResultPayload | null = null;
    let screenshotData: JsonRecord | null = null;
    let deliveryError: unknown = null;
    try {
      const data = success
        ? await this.attachSinglePostActionScreenshot(call, result)
        : normalizeLocalToolResultData(result.data, result.error || 'Tool execution failed');
      const materializedData = await this.materializeScreenshotArtifact(data);
      const displayAttachments = toolResultDisplayAttachments(
        extractScreenshotDataFromData(materializedData),
        call.requestId,
      );
      const backendAttachments = backendDisplayAttachments(displayAttachments);
      payload = {
        request_id: call.requestId,
        success,
        data: backendAttachments
          ? {
            ...materializedData,
            display_attachments: backendAttachments,
          }
          : materializedData,
      };
      screenshotData = extractScreenshotDataFromData(payload.data);
      await this.options.sendToolResult(payload);
    } catch (error) {
      deliveryError = error;
    } finally {
      const deliveryErrorMessage = deliveryError
        ? `Tool result delivery failed: ${errorMessage(deliveryError)}`
        : null;
      const eventResult = payload?.data ?? { output: deliveryErrorMessage ?? 'Tool result delivery failed' };
      const attachments = toolResultDisplayAttachments(screenshotData, call.requestId);
      await this.options.store?.appendEvent(createConversationEvent({
        eventId: `${event.turnRef ?? event.conversationRef}-local-tool-output-${call.requestId}`,
        type: 'tool_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sdk',
        payload: {
          requestId: call.requestId,
          toolCallId: call.toolCallId ?? null,
          correlationId: call.correlationId ?? null,
          toolName: call.toolName,
          success: deliveryError ? false : success,
          result: eventResult,
          ...(screenshotData ?? {}),
          ...(attachments ? { attachments } : {}),
          error: deliveryErrorMessage ?? (success ? null : result.error || 'Tool execution failed'),
          deliveryFailed: Boolean(deliveryError),
          elapsedMs: Date.now() - startedAt,
        },
      }));
      await this.options.emitTrace?.({
        path: 'tool.execution',
        stage: 'single_tool',
        status: deliveryError || !success ? 'failed' : 'succeeded',
        runtime: 'sdk',
        requestId: call.requestId,
        durationMs: durationSince(startedAt),
        data: {
          toolName: call.toolName,
          success: deliveryError ? false : success,
          deliveryFailed: Boolean(deliveryError),
          hasScreenshotRef: Boolean(screenshotData?.screenshot_ref),
        },
        error: deliveryError ?? (success ? null : result.error ?? 'Tool execution failed'),
      });
      if (call.toolName === 'browser') {
        await this.options.emitTrace?.({
          path: 'browser.runtime',
          stage: 'action',
          status: deliveryError || !success ? 'failed' : 'succeeded',
          runtime: 'local-runtime',
          requestId: call.requestId,
          durationMs: durationSince(startedAt),
          data: {
            action: browserActionFromArgs(call.args),
            success: deliveryError ? false : success,
            deliveryFailed: Boolean(deliveryError),
            ...browserRuntimeData(isJsonRecord(result.data) ? result.data : null),
          },
          error: deliveryError ?? (success ? null : result.error ?? 'Browser action failed'),
        });
      }
    }
    if (deliveryError) {
      throw deliveryError;
    }
  }

  private async executeBundle(event: ConversationEvent): Promise<void> {
    if (!this.options.localRuntime?.executeTool) {
      return;
    }
    const payload = event.payload;
    const startedAt = Date.now();
    const bundleId = typeof payload.bundleId === 'string' ? payload.bundleId : '';
    const tools = Array.isArray(payload.tools) ? payload.tools : [];
    const stepResults: ToolBundleStepResult[] = [];
    const executedSteps: ExecutedBundleStep[] = [];
    let status: ToolBundleResultPayload['status'] = 'failure';
    let resultPayload: ToolBundleResultPayload = {
      bundle_id: bundleId,
      status,
      step_results: stepResults,
    };
    let deliveryError: unknown = null;
    await this.options.emitTrace?.({
      path: 'tool.execution',
      stage: 'bundle',
      status: 'started',
      runtime: 'sdk',
      requestId: bundleId,
      data: {
        bundleId,
        toolCount: tools.length,
      },
    });
    try {
      for (const [sourceToolIndex, step] of tools.entries()) {
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
          continue;
        }
        const record = step as JsonRecord;
        const toolName = typeof record.name === 'string' ? record.name : '';
        if (!toolName) {
          continue;
        }
        const toolCallId = stringPayloadField(record, 'toolCallId')
          ?? resolveModelFacingToolCallId(record);
        let result: LocalToolResult;
        try {
          result = await this.executeLocalTool({
            toolName,
            args: record.args && typeof record.args === 'object' && !Array.isArray(record.args)
              ? record.args as JsonRecord
              : {},
            bundleId,
            toolCallId,
            turnRef: event.turnRef,
            conversationRef: event.conversationRef,
          });
        } catch (error) {
          result = failureResult(error);
        }
        const success = result.success !== false;
        const stepResult = await this.materializeBundleStepScreenshots({
          tool: toolName,
          ...(toolCallId ? { toolCallId } : {}),
          status: success ? 'ok' : 'error',
          output: success
            ? normalizeLocalToolResultData(result.data)
            : normalizeLocalToolResultData(result.data || { output: result.error || 'Tool execution failed' }),
        });
        stepResults.push(stepResult);
        executedSteps.push({
          sourceTool: record,
          sourceToolIndex,
          result: stepResult,
        });
      }
      const failures = stepResults.filter(step => step.status !== 'ok');
      status = failures.length === 0
        ? 'success'
        : (failures.length === stepResults.length ? 'failure' : 'partial_failure');
      resultPayload = await this.materializeBundleScreenshots(await this.attachBundlePostActionScreenshot({
        executedSteps,
        resultPayload: {
          bundle_id: bundleId,
          status,
          step_results: stepResults,
          error: failures.length > 0 ? `${failures.length} bundled tool step(s) failed` : undefined,
        },
        turnRef: event.turnRef,
        conversationRef: event.conversationRef,
      }));
      await this.options.sendToolBundleResult(resultPayload);
    } catch (error) {
      deliveryError = error;
    } finally {
      const deliveryErrorMessage = deliveryError
        ? `Tool bundle result delivery failed: ${errorMessage(deliveryError)}`
        : null;
      await this.options.store?.appendEvent(createConversationEvent({
        eventId: `${event.turnRef ?? event.conversationRef}-local-tool-bundle-output-${bundleId}`,
        type: 'tool_bundle_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sdk',
        payload: {
          bundleId,
          status: deliveryError ? 'failure' : status,
          stepResults,
          screenshot: resultPayload.screenshot ?? null,
          screenshotRef: resultPayload.screenshot_ref ?? null,
          screenshotUrl: (resultPayload as JsonRecord).screenshot_url ?? null,
          captureMeta: resultPayload.capture_meta ?? null,
          error: deliveryErrorMessage ?? resultPayload.error ?? null,
          deliveryFailed: Boolean(deliveryError),
        },
      }));
      await this.options.emitTrace?.({
        path: 'tool.execution',
        stage: 'bundle',
        status: deliveryError || status !== 'success' ? 'failed' : 'succeeded',
        runtime: 'sdk',
        requestId: bundleId,
        durationMs: durationSince(startedAt),
        data: {
          bundleId,
          toolCount: tools.length,
          executedStepCount: stepResults.length,
          bundleStatus: deliveryError ? 'failure' : status,
          deliveryFailed: Boolean(deliveryError),
          hasScreenshotRef: Boolean(resultPayload.screenshot_ref),
        },
        error: deliveryError ?? (status === 'success' ? null : resultPayload.error ?? 'Bundled tool execution failed'),
      });
    }
    if (deliveryError) {
      throw deliveryError;
    }
  }
}
