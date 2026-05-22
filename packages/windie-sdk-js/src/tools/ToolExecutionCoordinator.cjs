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

function normalizeToolResultData(data) {
  if (isPlainObject(data)) {
    const displayContent = (
      typeof data.display_content === 'string'
        ? data.display_content
        : (typeof data.return_display === 'string'
          ? data.return_display
          : (typeof data.output === 'string'
            ? data.output
            : (typeof data.message === 'string' ? data.message : '')))
    );
    if (typeof data.llm_content === 'string' && data.llm_content.trim()) {
      return {
        ...data,
        display_content: displayContent || data.llm_content,
      };
    }
    const fallbackContent = displayContent || JSON.stringify(data);
    return {
      ...data,
      display_content: fallbackContent,
      llm_content: fallbackContent,
    };
  }
  if (typeof data === 'string') {
    return {
      output: data,
      display_content: data,
      llm_content: data,
    };
  }
  if (data === null || typeof data === 'undefined') {
    return {};
  }
  return {
    output: data,
  };
}

function resolveToolOutputDisplayText(payload) {
  const data = payload?.data;
  if (payload?.success === false && typeof payload?.error === 'string' && payload.error.trim()) {
    return `Error: ${payload.error}`;
  }
  if (isPlainObject(data)) {
    for (const key of ['display_content', 'return_display', 'output', 'message', 'llm_content', 'model_llm_content']) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return JSON.stringify(data);
  }
  if (typeof data === 'string' && data.trim()) {
    return data;
  }
  if (data !== null && typeof data !== 'undefined') {
    return JSON.stringify(data);
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
    for (const key of ['display_content', 'return_display', 'output', 'message', 'llm_content', 'model_llm_content']) {
      const value = output[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return JSON.stringify(output);
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
      ? normalizeToolResultData(result?.data)
      : normalizeToolResultData(result?.data || { output: error }),
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
    const payload = buildToolResultPayload({
      requestId,
      result,
    });
    deps.sendToolResult(payload);
    deps.onToolOutput?.(buildRendererToolOutputEvent(event, payload, startedAt));
  } catch (error) {
    const payload = {
      request_id: requestId,
      success: false,
      error: error?.message || String(error),
      data: normalizeToolResultData({ output: error?.message || String(error) }),
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
  for (const tool of tools) {
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
      const result = await deps.executeLocalTool({
        toolName,
        args: isPlainObject(tool.args) ? tool.args : {},
        bundleId,
        toolCallId,
      });
      const success = result?.success !== false;
      stepResults.push({
        tool: toolName,
        ...(toolCallId ? { toolCallId } : {}),
        status: success ? 'ok' : 'error',
        output: success
          ? (isPlainObject(result?.data) ? result.data : normalizeToolResultData(result?.data))
          : { error: result?.error || 'Tool execution failed' },
      });
    } catch (error) {
      stepResults.push({
        tool: toolName,
        status: 'error',
        output: {
          error: error?.message || String(error),
        },
      });
    }
  }

  if (stepResults.length === 0) {
    return false;
  }
  const failedSteps = stepResults.filter((step) => step.status !== 'ok');
  const status = failedSteps.length === 0
    ? 'success'
    : (failedSteps.length === stepResults.length ? 'failure' : 'partial_failure');
  const resultPayload = {
    bundle_id: bundleId,
    status,
    step_results: stepResults,
    error: failedSteps.length > 0 ? `${failedSteps.length} bundled tool step(s) failed` : null,
  };
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
