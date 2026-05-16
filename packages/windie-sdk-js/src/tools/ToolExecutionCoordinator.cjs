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
  for (const key of ['request_id', 'correlation_id']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return typeof fallbackId === 'string' && fallbackId.trim() ? fallbackId.trim() : '';
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
  const toolName = typeof event.payload.tool_name === 'string'
    ? event.payload.tool_name.trim()
    : '';
  const requestId = resolveToolCallRequestId(event.payload, event.id);
  if (!toolName || !requestId) {
    return false;
  }
  try {
    const result = await deps.executeLocalTool({
      toolName,
      args: isPlainObject(event.payload.parameters) ? event.payload.parameters : {},
    });
    deps.sendToolResult(buildToolResultPayload({
      requestId,
      result,
    }));
  } catch (error) {
    deps.sendToolResult({
      request_id: requestId,
      success: false,
      error: error?.message || String(error),
      data: normalizeToolResultData({ output: error?.message || String(error) }),
    });
  }
  return true;
}

async function routeToolBundleToLocalRuntime(event, deps) {
  if (!isPlainObject(event?.payload) || shouldSkipLocalToolRouting(event)) {
    return false;
  }
  const bundleId = typeof event.payload.bundle_id === 'string'
    ? event.payload.bundle_id.trim()
    : '';
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
    try {
      const result = await deps.executeLocalTool({
        toolName,
        args: isPlainObject(tool.args) ? tool.args : {},
      });
      const success = result?.success !== false;
      stepResults.push({
        tool: toolName,
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
  markRendererToolEventDisplayOnly,
  routeSdkToolEventToLocalRuntime,
  resolveToolCallRequestId,
};
