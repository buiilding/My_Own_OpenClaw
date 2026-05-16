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
    return typeof fallbackId === 'string' && fallbackId.trim() ? fallbackId.trim() : '';
  }
  for (const key of ['requestId', 'request_id', 'correlationId', 'correlation_id']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return typeof fallbackId === 'string' && fallbackId.trim() ? fallbackId.trim() : '';
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
    if (typeof data.llm_content === 'string' && data.llm_content.trim()) {
      return data;
    }
    const fallbackContent = (
      typeof data.output === 'string'
        ? data.output
        : JSON.stringify(data)
    );
    return {
      ...data,
      llm_content: fallbackContent,
    };
  }
  if (typeof data === 'string') {
    return {
      output: data,
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
    for (const key of ['llm_content', 'return_display', 'output', 'message']) {
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
  deps.sendToolBundleResult({
    bundle_id: bundleId,
    status,
    step_results: stepResults,
    error: failedSteps.length > 0 ? `${failedSteps.length} bundled tool step(s) failed` : null,
  });
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
  markRendererToolEventDisplayOnly,
  routeSdkToolEventToLocalRuntime,
  resolveToolCallRequestId,
};
