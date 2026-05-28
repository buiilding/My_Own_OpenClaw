import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import type {
  ConversationEvent,
  ConversationStore,
  JsonRecord,
  LocalRuntime,
  LocalToolCall,
  LocalToolResult,
  ToolBundleResultPayload,
  ToolBundleStepResult,
  ToolResultPayload,
} from '../conversation/types.js';
import { resolveModelFacingToolCallId } from './toolCorrelationIds.js';
import { normalizeLocalToolResultData } from './toolOutputContent.js';

export type ToolExecutionCoordinatorOptions = {
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool'>> | null;
  store?: Pick<ConversationStore, 'appendEvent'> | null;
  sendToolResult: (payload: ToolResultPayload) => Promise<void>;
  sendToolBundleResult: (payload: ToolBundleResultPayload) => Promise<void>;
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
  if (!isJsonRecord(data)) {
    return null;
  }
  const screenshot = typeof data.screenshot === 'string' && data.screenshot.trim()
    ? data.screenshot
    : null;
  const screenshotRef = typeof data.screenshot_ref === 'string' && data.screenshot_ref.trim()
    ? data.screenshot_ref
    : (typeof data.screenshotRef === 'string' && data.screenshotRef.trim() ? data.screenshotRef : null);
  const screenshotUrl = typeof data.screenshot_url === 'string' && data.screenshot_url.trim()
    ? data.screenshot_url
    : (typeof data.screenshotUrl === 'string' && data.screenshotUrl.trim() ? data.screenshotUrl : null);
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
  const toolName = typeof payload.toolName === 'string'
    ? payload.toolName
    : (typeof payload.tool_name === 'string' ? payload.tool_name : '');
  if (!toolName) {
    return null;
  }
  return {
    toolName,
    args: payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
      ? payload.args as JsonRecord
      : {},
    requestId: typeof payload.requestId === 'string'
      ? payload.requestId
      : (typeof payload.request_id === 'string' ? payload.request_id : null),
    bundleId: typeof payload.bundleId === 'string'
      ? payload.bundleId
      : (typeof payload.bundle_id === 'string' ? payload.bundle_id : null),
    toolCallId: stringPayloadField(payload, 'toolCallId', 'tool_call_id')
      ?? resolveModelFacingToolCallId(payload),
    correlationId: stringPayloadField(payload, 'correlationId', 'correlation_id'),
    turnRef: event.turnRef,
    conversationRef: event.conversationRef,
  };
}

export class ToolExecutionCoordinator {
  constructor(private readonly options: ToolExecutionCoordinatorOptions) {}

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
      const result = await this.options.localRuntime.executeTool({
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
      const bundleId = typeof event.payload.bundleId === 'string'
        ? event.payload.bundleId
        : (typeof event.payload.bundle_id === 'string' ? event.payload.bundle_id : '');
      if (!bundleId || !Array.isArray(event.payload.tools)) {
        return { claimed: false, reason: 'missing-bundle-id-or-tools' };
      }
    }
    return { claimed: true };
  }

  async execute(event: ConversationEvent): Promise<ToolClaimResult> {
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
    let result: LocalToolResult;
    try {
      result = await this.options.localRuntime.executeTool(call);
    } catch (error) {
      result = failureResult(error);
    }
    const success = result.success !== false;
    const data = success
      ? await this.attachSinglePostActionScreenshot(call, result)
      : normalizeLocalToolResultData(result.data, result.error || 'Tool execution failed');
    const payload: ToolResultPayload = {
      request_id: call.requestId,
      success,
      data,
    };
    const screenshotData = extractScreenshotDataFromData(payload.data);
    let deliveryError: unknown = null;
    try {
      await this.options.sendToolResult(payload);
    } catch (error) {
      deliveryError = error;
    } finally {
      const deliveryErrorMessage = deliveryError
        ? `Tool result delivery failed: ${errorMessage(deliveryError)}`
        : null;
      await this.options.store?.appendEvent(createConversationEvent({
        type: 'tool_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sidecar',
        payload: {
          requestId: call.requestId,
          toolCallId: call.toolCallId ?? null,
          correlationId: call.correlationId ?? null,
          toolName: call.toolName,
          success: deliveryError ? false : success,
          result: payload.data,
          ...(screenshotData ?? {}),
          error: deliveryErrorMessage ?? (success ? null : result.error || 'Tool execution failed'),
          deliveryFailed: Boolean(deliveryError),
          elapsedMs: Date.now() - startedAt,
        },
      }));
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
    const bundleId = typeof payload.bundleId === 'string'
      ? payload.bundleId
      : (typeof payload.bundle_id === 'string' ? payload.bundle_id : '');
    const tools = Array.isArray(payload.tools) ? payload.tools : [];
    const stepResults: ToolBundleStepResult[] = [];
    const executedSteps: ExecutedBundleStep[] = [];
    for (const [sourceToolIndex, step] of tools.entries()) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        continue;
      }
      const record = step as JsonRecord;
      const toolName = typeof record.name === 'string' ? record.name : '';
      if (!toolName) {
        continue;
      }
      const toolCallId = stringPayloadField(record, 'toolCallId', 'tool_call_id')
        ?? resolveModelFacingToolCallId(record);
      let result: LocalToolResult;
      try {
        result = await this.options.localRuntime.executeTool({
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
      const stepResult: ToolBundleStepResult = {
        tool: toolName,
        ...(toolCallId ? { toolCallId } : {}),
        status: success ? 'ok' : 'error',
        output: success
          ? normalizeLocalToolResultData(result.data)
          : normalizeLocalToolResultData(result.data || { output: result.error || 'Tool execution failed' }),
      };
      stepResults.push(stepResult);
      executedSteps.push({
        sourceTool: record,
        sourceToolIndex,
        result: stepResult,
      });
    }
    const failures = stepResults.filter(step => step.status !== 'ok');
    const status = failures.length === 0
      ? 'success'
      : (failures.length === stepResults.length ? 'failure' : 'partial_failure');
    const resultPayload = await this.attachBundlePostActionScreenshot({
      executedSteps,
      resultPayload: {
        bundle_id: bundleId,
        status,
        step_results: stepResults,
        error: failures.length > 0 ? `${failures.length} bundled tool step(s) failed` : undefined,
      },
      turnRef: event.turnRef,
      conversationRef: event.conversationRef,
    });
    let deliveryError: unknown = null;
    try {
      await this.options.sendToolBundleResult(resultPayload);
    } catch (error) {
      deliveryError = error;
    } finally {
      const deliveryErrorMessage = deliveryError
        ? `Tool bundle result delivery failed: ${errorMessage(deliveryError)}`
        : null;
      await this.options.store?.appendEvent(createConversationEvent({
        eventId: createRuntimeId('bundle_output'),
        type: 'tool_bundle_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sidecar',
        payload: {
          bundleId,
          status: deliveryError ? 'failure' : status,
          stepResults,
          screenshot: resultPayload.screenshot ?? null,
          screenshotRef: resultPayload.screenshot_ref ?? null,
          captureMeta: resultPayload.capture_meta ?? null,
          error: deliveryErrorMessage ?? resultPayload.error ?? null,
          deliveryFailed: Boolean(deliveryError),
        },
      }));
    }
    if (deliveryError) {
      throw deliveryError;
    }
  }
}
