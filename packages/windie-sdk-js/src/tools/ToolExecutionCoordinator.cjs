function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJson(value) {
  if (!isPlainObject(value)) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function resolveToolCallRequestId(payload, fallbackId = null) {
  if (!isPlainObject(payload)) {
    return '';
  }
  for (const key of ['requestId', 'request_id']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function resolveStringField(payload, keys) {
  if (!isPlainObject(payload)) {
    return null;
  }
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

const DISPLAY_FALLBACK_KEYS = ['return_display', 'output', 'message'];
const MODEL_FALLBACK_KEYS = ['llm_content', 'output', 'message'];
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

function normalizeLocalToolResultData(data) {
  if (!isPlainObject(data)) {
    if (typeof data === 'string') {
      return {
        output: data,
        display_content: data,
        llm_content: data,
      };
    }
    return data === null || typeof data === 'undefined' ? {} : { output: data };
  }
  const displayContent = resolveStringField(data, ['display_content'])
    ?? resolveStringField(data, DISPLAY_FALLBACK_KEYS)
    ?? resolveStringField(data, ['llm_content'])
    ?? JSON.stringify(data);
  const llmContent = resolveStringField(data, ['llm_content']) ?? displayContent;
  return {
    ...data,
    display_content: displayContent,
    llm_content: llmContent,
  };
}

function readToolOutputDisplayText(data) {
  if (!isPlainObject(data)) {
    if (typeof data === 'string' && data.trim()) {
      return data;
    }
    return data !== null && typeof data !== 'undefined' ? JSON.stringify(data) : null;
  }
  return resolveStringField(data, ['display_content'])
    ?? resolveStringField(data, DISPLAY_FALLBACK_KEYS)
    ?? resolveStringField(data, MODEL_FALLBACK_KEYS)
    ?? JSON.stringify(data);
}

function normalizeToolName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isPositiveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isCaptureWorthyTool(toolName, args) {
  const normalizedToolName = normalizeToolName(toolName);
  if (COMPUTER_USE_CAPTURE_TOOL_NAMES.has(normalizedToolName)) {
    return true;
  }
  return (
    normalizedToolName === 'run_shell_command'
    && isPlainObject(args)
    && isPositiveFiniteNumber(args.wait)
  );
}

function isExplicitScreenshotTool(toolName) {
  return normalizeToolName(toolName) === 'screenshot';
}

function resolvePostActionWaitSeconds(toolName, args) {
  const normalizedToolName = normalizeToolName(toolName);
  if (normalizedToolName === 'wait' && isPlainObject(args) && isPositiveFiniteNumber(args.seconds)) {
    return args.seconds;
  }
  if (isPlainObject(args) && typeof args.wait === 'number' && Number.isFinite(args.wait)) {
    return Math.max(0, args.wait);
  }
  if (normalizedToolName === 'run_shell_command' && isPlainObject(args) && isPositiveFiniteNumber(args.wait)) {
    return args.wait;
  }
  return DEFAULT_POST_ACTION_CAPTURE_WAIT_SECONDS;
}

function delaySeconds(seconds) {
  const milliseconds = Math.max(0, seconds) * 1000;
  if (milliseconds <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function extractScreenshotData(result) {
  const data = isPlainObject(result?.data) ? result.data : null;
  if (!data) {
    return null;
  }
  const screenshot = typeof data.screenshot === 'string' && data.screenshot.trim()
    ? data.screenshot
    : null;
  const screenshotRef = typeof data.screenshot_ref === 'string' && data.screenshot_ref.trim()
    ? data.screenshot_ref
    : (typeof data.screenshotRef === 'string' && data.screenshotRef.trim() ? data.screenshotRef : null);
  if (!screenshot && !screenshotRef) {
    return null;
  }
  return {
    ...(screenshot ? { screenshot } : {}),
    ...(screenshotRef ? { screenshot_ref: screenshotRef } : {}),
    ...(typeof data.screenshot_content_type === 'string' ? { screenshot_content_type: data.screenshot_content_type } : {}),
    ...(isPlainObject(data.capture_meta) ? { capture_meta: data.capture_meta } : {}),
  };
}

function extractScreenshotDataFromData(data) {
  return extractScreenshotData({ data });
}

function mergePostActionScreenshot(data, screenshotData, sourceToolName) {
  const normalizedData = normalizeLocalToolResultData(data);
  if (!screenshotData) {
    return normalizedData;
  }
  return {
    ...normalizedData,
    ...screenshotData,
    post_action_screenshot: true,
    post_action_screenshot_tool: sourceToolName,
  };
}

async function capturePostActionScreenshot(deps, {
  waitSeconds,
  explanation,
  turnRef,
  conversationRef,
}) {
  if (typeof deps.executeLocalTool !== 'function') {
    return null;
  }
  await delaySeconds(waitSeconds);
  try {
    const result = await deps.executeLocalTool({
      toolName: 'screenshot',
      args: {
        explanation,
        wait: 0,
      },
      turnRef,
      conversationRef,
    });
    if (result?.success === false) {
      return null;
    }
    return extractScreenshotData(result);
  } catch (_error) {
    return null;
  }
}

async function attachSinglePostActionScreenshot(deps, {
  toolName,
  args,
  data,
  turnRef,
  conversationRef,
}) {
  const normalizedData = normalizeLocalToolResultData(data);
  if (
    isExplicitScreenshotTool(toolName)
    || !isCaptureWorthyTool(toolName, args)
    || extractScreenshotDataFromData(normalizedData)
  ) {
    return normalizedData;
  }
  const screenshotData = await capturePostActionScreenshot(deps, {
    waitSeconds: resolvePostActionWaitSeconds(toolName, args),
    explanation: `Capturing the screen after ${toolName} execution.`,
    turnRef,
    conversationRef,
  });
  return mergePostActionScreenshot(normalizedData, screenshotData, toolName);
}

function resolveBundleCaptureWaitSeconds(executedSteps) {
  let waitSeconds = 0;
  for (const { sourceTool: tool, result } of executedSteps) {
    if (!isPlainObject(tool)) {
      continue;
    }
    const toolName = typeof tool.name === 'string' ? tool.name : '';
    const args = isPlainObject(tool.args) ? tool.args : {};
    if (result?.status === 'ok' && isCaptureWorthyTool(toolName, args)) {
      waitSeconds = Math.max(waitSeconds, resolvePostActionWaitSeconds(toolName, args));
    }
  }
  return waitSeconds;
}

function bundleContainsCaptureWorthyTool(executedSteps) {
  return executedSteps.some(({ sourceTool: tool, result }) => {
    if (!isPlainObject(tool)) {
      return false;
    }
    const toolName = typeof tool.name === 'string' ? tool.name : '';
    const args = isPlainObject(tool.args) ? tool.args : {};
    return result?.status === 'ok' && isCaptureWorthyTool(toolName, args);
  });
}

function findBundleScreenshotFromExplicitStep(executedSteps) {
  for (let index = executedSteps.length - 1; index >= 0; index -= 1) {
    const { sourceTool: tool, result: step } = executedSteps[index];
    if (
      !isPlainObject(tool)
      || !isExplicitScreenshotTool(tool.name)
      || step?.status !== 'ok'
    ) {
      continue;
    }
    const screenshotData = extractScreenshotDataFromData(step.output);
    if (screenshotData) {
      return screenshotData;
    }
  }
  return null;
}

async function attachBundlePostActionScreenshot(deps, {
  executedSteps,
  resultPayload,
  turnRef,
  conversationRef,
}) {
  if (extractScreenshotDataFromData(resultPayload)) {
    return resultPayload;
  }
  const explicitScreenshot = findBundleScreenshotFromExplicitStep(executedSteps);
  if (explicitScreenshot) {
    return {
      ...resultPayload,
      ...explicitScreenshot,
    };
  }
  if (!bundleContainsCaptureWorthyTool(executedSteps)) {
    return resultPayload;
  }
  const screenshotData = await capturePostActionScreenshot(deps, {
    waitSeconds: resolveBundleCaptureWaitSeconds(executedSteps),
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

function resolveModelFacingToolCallId(payload) {
  const toolCall = payload?.metadata?.model_facing_tool_call;
  return isPlainObject(toolCall) && typeof toolCall.id === 'string' && toolCall.id.trim()
    ? toolCall.id.trim()
    : null;
}

function shouldSkipLocalToolRouting(event) {
  return event?.payload?.metadata?.skip_frontend_execution === true;
}

function markRendererToolEventDisplayOnly(event) {
  if (!isPlainObject(event)) {
    return event;
  }
  if (event.type !== 'tool-call' && event.type !== 'tool-bundle') {
    return event;
  }
  const nextEvent = cloneJson(event);
  if (nextEvent.type === 'tool-call') {
    nextEvent.payload = isPlainObject(nextEvent.payload) ? nextEvent.payload : {};
    nextEvent.payload.metadata = {
      ...(isPlainObject(nextEvent.payload.metadata) ? nextEvent.payload.metadata : {}),
      skip_frontend_execution: true,
      execution_owner: 'sdk-runtime',
    };
    return nextEvent;
  }
  const payload = isPlainObject(nextEvent.payload) ? nextEvent.payload : {};
  nextEvent.payload = {
    ...payload,
    metadata: {
      ...(isPlainObject(payload.metadata) ? payload.metadata : {}),
      skip_frontend_execution: true,
      execution_owner: 'sdk-runtime',
    },
    tools: Array.isArray(payload.tools)
      ? payload.tools.map((tool) => ({
          ...(isPlainObject(tool) ? tool : {}),
          metadata: {
            ...(isPlainObject(tool?.metadata) ? tool.metadata : {}),
            skip_frontend_execution: true,
            execution_owner: 'sdk-runtime',
          },
        }))
      : payload.tools,
  };
  return nextEvent;
}

function resolveToolOutputDisplayText(payload) {
  const data = payload?.data;
  if (payload?.success === false && typeof payload?.error === 'string' && payload.error.trim()) {
    return `Error: ${payload.error}`;
  }
  const displayText = readToolOutputDisplayText(data);
  if (displayText) {
    return displayText;
  }
  return payload?.success === false ? 'Tool execution failed' : 'No output';
}

function buildRendererToolOutputEvent(event, payload, startedAt) {
  const sourcePayload = isPlainObject(event?.payload) ? event.payload : {};
  const data = isPlainObject(payload?.data) ? payload.data : {};
  const metadata = isPlainObject(sourcePayload.metadata) ? sourcePayload.metadata : {};
  const requestId = resolveToolCallRequestId(sourcePayload, event?.id);
  return {
    id: requestId ? `${requestId}:tool-output` : undefined,
    type: 'tool-output',
    session_id: event?.session_id,
    user_id: event?.user_id,
    conversation_ref: event?.conversation_ref,
    turn_ref: event?.turn_ref,
    payload: {
      tool_name: resolveStringField(sourcePayload, ['toolName', 'tool_name']) || '',
      success: payload?.success !== false,
      execution_time: (Date.now() - startedAt) / 1000,
      output: resolveToolOutputDisplayText(payload),
      error: payload?.success === false ? (payload?.error || 'Tool execution failed') : null,
      screenshot: typeof data.screenshot === 'string' ? data.screenshot : null,
      screenshot_ref: (
        typeof data.screenshot_ref === 'string'
          ? data.screenshot_ref
          : (typeof data.screenshotRef === 'string' ? data.screenshotRef : null)
      ),
      request_id: requestId || undefined,
      metadata: {
        ...metadata,
        skip_frontend_execution: true,
        execution_owner: 'sdk-runtime',
        display_projection: 'local-tool-result',
      },
    },
  };
}

function resolveStepOutputText(step) {
  const output = step?.output;
  if (step?.status !== 'ok') {
    const error = isPlainObject(output) && typeof output.error === 'string' && output.error.trim()
      ? output.error.trim()
      : 'Tool execution failed';
    return `Error: ${error}`;
  }
  if (isPlainObject(output)) {
    return readToolOutputDisplayText(output);
  }
  if (typeof output === 'string' && output.trim()) {
    return output;
  }
  if (output !== null && typeof output !== 'undefined') {
    return JSON.stringify(output);
  }
  return 'No output';
}

function resolveBundleOutputDisplayText(stepResults) {
  if (!Array.isArray(stepResults) || stepResults.length === 0) {
    return 'No bundled tool output';
  }
  return stepResults.map((step, index) => {
    const toolName = typeof step?.tool === 'string' && step.tool.trim()
      ? step.tool.trim()
      : `step ${index + 1}`;
    return [`${index + 1}. ${toolName}`, resolveStepOutputText(step)].join('\n');
  }).join('\n\n');
}

function buildRendererToolBundleOutputEvent(event, payload, startedAt) {
  const sourcePayload = isPlainObject(event?.payload) ? event.payload : {};
  const metadata = isPlainObject(sourcePayload.metadata) ? sourcePayload.metadata : {};
  const stepResults = Array.isArray(payload?.step_results) ? payload.step_results : [];
  const bundleId = resolveStringField(sourcePayload, ['bundleId', 'bundle_id'])
    ?? resolveStringField(payload, ['bundleId', 'bundle_id']);
  return {
    id: bundleId ? `${bundleId}:tool-output` : undefined,
    type: 'tool-output',
    session_id: event?.session_id,
    user_id: event?.user_id,
    conversation_ref: event?.conversation_ref,
    turn_ref: event?.turn_ref,
    payload: {
      tool_name: 'tool-bundle',
      success: payload?.status === 'success',
      execution_time: (Date.now() - startedAt) / 1000,
      output: resolveBundleOutputDisplayText(stepResults),
      error: payload?.status === 'success' ? null : (payload?.error || 'Bundled tool execution failed'),
      bundle_id: bundleId || undefined,
      step_results: stepResults,
      screenshot: typeof payload?.screenshot === 'string' ? payload.screenshot : null,
      screenshot_ref: (
        typeof payload?.screenshot_ref === 'string'
          ? payload.screenshot_ref
          : (typeof payload?.screenshotRef === 'string' ? payload.screenshotRef : null)
      ),
      capture_meta: isPlainObject(payload?.capture_meta) ? payload.capture_meta : null,
      metadata: {
        ...metadata,
        skip_frontend_execution: true,
        execution_owner: 'sdk-runtime',
        display_projection: 'local-tool-bundle-result',
      },
    },
  };
}

function buildToolResultPayload({ requestId, result }) {
  const success = result?.success !== false;
  const error = result?.error || 'Tool execution failed';
  return {
    request_id: requestId,
    success,
    data: success
      ? normalizeLocalToolResultData(result?.data)
      : normalizeLocalToolResultData(result?.data || { output: error }),
    error: success ? undefined : error,
  };
}

async function routeToolCallToLocalRuntime(event, deps) {
  if (!isPlainObject(event?.payload) || shouldSkipLocalToolRouting(event)) {
    return false;
  }
  const toolName = resolveStringField(event.payload, ['toolName', 'tool_name']) ?? '';
  const requestId = resolveToolCallRequestId(event.payload, event.id);
  if (!toolName || !requestId) {
    return false;
  }
  const startedAt = Date.now();
  try {
    const result = await deps.executeLocalTool({
      toolName,
      args: isPlainObject(event.payload.args)
        ? event.payload.args
        : (isPlainObject(event.payload.parameters) ? event.payload.parameters : {}),
      requestId,
      toolCallId: resolveStringField(event.payload, ['toolCallId', 'tool_call_id']) ?? resolveModelFacingToolCallId(event.payload),
      correlationId: resolveStringField(event.payload, ['correlationId', 'correlation_id']),
    });
    const args = isPlainObject(event.payload.args)
      ? event.payload.args
      : (isPlainObject(event.payload.parameters) ? event.payload.parameters : {});
    const data = result?.success === false
      ? normalizeLocalToolResultData(result?.data || { output: result?.error || 'Tool execution failed' })
      : await attachSinglePostActionScreenshot(deps, {
        toolName,
        args,
        data: result?.data,
        turnRef: event.turn_ref,
        conversationRef: event.conversation_ref,
      });
    const payload = buildToolResultPayload({
      requestId,
      result: {
        ...result,
        data,
      },
    });
    deps.sendToolResult(payload);
    deps.onToolOutput?.(buildRendererToolOutputEvent(event, payload, startedAt));
  } catch (error) {
    const payload = {
      request_id: requestId,
      success: false,
      error: error?.message || String(error),
      data: normalizeLocalToolResultData({ output: error?.message || String(error) }),
    };
    deps.sendToolResult(payload);
    deps.onToolOutput?.(buildRendererToolOutputEvent(event, payload, startedAt));
  }
  return true;
}

async function routeToolBundleToLocalRuntime(event, deps) {
  if (!isPlainObject(event?.payload) || shouldSkipLocalToolRouting(event)) {
    return false;
  }
  const bundleId = resolveStringField(event.payload, ['bundleId', 'bundle_id']) ?? '';
  const tools = Array.isArray(event.payload.tools) ? event.payload.tools : [];
  if (!bundleId || tools.length === 0) {
    return false;
  }

  const startedAt = Date.now();
  const stepResults = [];
  const executedSteps = [];
  for (const [sourceToolIndex, tool] of tools.entries()) {
    if (!isPlainObject(tool)) {
      continue;
    }
    const toolName = typeof tool.name === 'string' ? tool.name.trim() : '';
    if (!toolName) {
      continue;
    }
    const toolCallId = resolveStringField(tool, ['toolCallId', 'tool_call_id'])
      ?? resolveModelFacingToolCallId(tool);
    try {
      const args = isPlainObject(tool.args) ? tool.args : {};
      const result = await deps.executeLocalTool({
        toolName,
        args,
        bundleId,
        toolCallId,
      });
      const success = result?.success !== false;
      const stepResult = {
        tool: toolName,
        ...(toolCallId ? { toolCallId } : {}),
        status: success ? 'ok' : 'error',
        output: success
          ? normalizeLocalToolResultData(result?.data)
          : { error: result?.error || 'Tool execution failed' },
      };
      stepResults.push(stepResult);
      executedSteps.push({ sourceTool: tool, sourceToolIndex, result: stepResult });
    } catch (error) {
      const stepResult = {
        tool: toolName,
        status: 'error',
        output: {
          error: error?.message || String(error),
        },
      };
      stepResults.push(stepResult);
      executedSteps.push({ sourceTool: tool, sourceToolIndex, result: stepResult });
    }
  }

  if (stepResults.length === 0) {
    return false;
  }
  const failedSteps = stepResults.filter((step) => step.status !== 'ok');
  const status = failedSteps.length === 0
    ? 'success'
    : (failedSteps.length === stepResults.length ? 'failure' : 'partial_failure');
  const resultPayload = await attachBundlePostActionScreenshot(deps, {
    executedSteps,
    resultPayload: {
      bundle_id: bundleId,
      status,
      step_results: stepResults,
      error: failedSteps.length > 0 ? `${failedSteps.length} bundled tool step(s) failed` : null,
    },
    turnRef: event.turn_ref,
    conversationRef: event.conversation_ref,
  });
  deps.sendToolBundleResult(resultPayload);
  deps.onToolOutput?.(buildRendererToolBundleOutputEvent(event, resultPayload, startedAt));
  return true;
}

function routeSdkToolEventToLocalRuntime(event, deps = {}) {
  if (
    !isPlainObject(event)
    || typeof deps.executeLocalTool !== 'function'
  ) {
    return false;
  }
  if (event.type === 'tool-call' && typeof deps.sendToolResult !== 'function') {
    return false;
  }
  if (event.type === 'tool-bundle' && typeof deps.sendToolBundleResult !== 'function') {
    return false;
  }
  if (event.type === 'tool-call') {
    if (
      shouldSkipLocalToolRouting(event)
      || !isPlainObject(event.payload)
      || !resolveStringField(event.payload, ['toolName', 'tool_name'])
      || !resolveToolCallRequestId(event.payload)
    ) {
      return false;
    }
    void routeToolCallToLocalRuntime(event, deps).catch((error) => {
      deps.log?.(`SDK tool-call routing failed: ${error?.message || error}`);
    });
    return true;
  }
  if (event.type === 'tool-bundle') {
    void routeToolBundleToLocalRuntime(event, deps).catch((error) => {
      deps.log?.(`SDK tool-bundle routing failed: ${error?.message || error}`);
    });
    return true;
  }
  return false;
}

module.exports = {
  buildRendererToolOutputEvent,
  buildRendererToolBundleOutputEvent,
  markRendererToolEventDisplayOnly,
  routeSdkToolEventToLocalRuntime,
  resolveToolCallRequestId,
};
