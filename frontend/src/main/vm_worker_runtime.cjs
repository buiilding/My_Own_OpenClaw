const DEFAULT_HEARTBEAT_MS = 5000;

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseHeartbeatMs(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_HEARTBEAT_MS;
  }
  return parsed;
}

function normalizeRunFiles(files) {
  if (!Array.isArray(files)) {
    return [];
  }
  return files
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const artifactId = normalizeOptionalString(item.artifact_id);
      if (!artifactId) {
        return null;
      }
      return {
        artifact_id: artifactId,
        filename: normalizeOptionalString(item.filename),
        content_type: normalizeOptionalString(item.content_type),
      };
    })
    .filter(Boolean);
}

function buildAttachmentContextFromFiles(files) {
  const normalized = normalizeRunFiles(files);
  if (normalized.length === 0) {
    return null;
  }
  const lines = ['Run input artifacts:'];
  normalized.forEach((file, index) => {
    lines.push(`${index + 1}. artifact_id=${file.artifact_id}`);
    if (file.filename) {
      lines.push(`   filename=${file.filename}`);
    }
    if (file.content_type) {
      lines.push(`   content_type=${file.content_type}`);
    }
  });
  lines.push('Use these artifact identifiers with read_file/browser/computer-use tools as needed.');
  return lines.join('\n');
}

async function postJson(fetchFn, url, payload, authHeaders = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authHeaders || {}),
  };
  const response = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} for ${url}: ${responseText}`);
  }
  return await response.json();
}

function createVmWorkerRuntime(options = {}) {
  const {
    env = process.env,
    getBackendConnectionState,
    sendAutomatedQuery,
    sendMessageToBackend,
    registerBackendMessageObserver,
    fetchFn = global.fetch,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    log = (...args) => console.log(...args),
    warn = (...args) => console.warn(...args),
  } = options;

  if (typeof getBackendConnectionState !== 'function') {
    throw new Error('createVmWorkerRuntime requires getBackendConnectionState');
  }
  if (typeof sendAutomatedQuery !== 'function') {
    throw new Error('createVmWorkerRuntime requires sendAutomatedQuery');
  }
  if (typeof registerBackendMessageObserver !== 'function') {
    throw new Error('createVmWorkerRuntime requires registerBackendMessageObserver');
  }
  if (typeof fetchFn !== 'function') {
    throw new Error('createVmWorkerRuntime requires fetch support');
  }

  const workspaceId = normalizeOptionalString(env.WINDIE_VM_WORKSPACE_ID) || 'default-workspace';
  const configuredWorkerId = normalizeOptionalString(env.WINDIE_VM_WORKER_ID);
  const configuredVmId = normalizeOptionalString(env.WINDIE_VM_ID);
  const configuredAgentId = normalizeOptionalString(env.WINDIE_VM_AGENT_ID);
  const heartbeatMs = parseHeartbeatMs(env.WINDIE_VM_WORKER_HEARTBEAT_MS);
  const runsApiKey = normalizeOptionalString(
    env.WINDIE_VM_RUNS_API_KEY || env.WINDIE_RUNS_API_KEY || env.WINDIE_DEMO_API_KEY,
  );
  const runsApiHeaders = runsApiKey
    ? { 'x-windie-runs-key': runsApiKey }
    : null;

  let active = false;
  let inTick = false;
  let intervalId = null;
  let removeBackendObserver = null;
  const activeConversationRunMap = new Map();
  const activeRunConversationMap = new Map();

  function workerIdForUser(userId) {
    return configuredWorkerId || `worker-${userId}`;
  }

  function vmIdForWorker(workerId) {
    return configuredVmId || `vm-${workerId}`;
  }

  function clearRunMapping(runId, conversationRef) {
    const normalizedRunId = normalizeOptionalString(runId);
    const normalizedConversationRef = normalizeOptionalString(conversationRef);
    if (normalizedRunId) {
      const previousConversationRef = activeRunConversationMap.get(normalizedRunId);
      activeRunConversationMap.delete(normalizedRunId);
      if (previousConversationRef) {
        activeConversationRunMap.delete(previousConversationRef);
      }
    }
    if (normalizedConversationRef) {
      const previousRunId = activeConversationRunMap.get(normalizedConversationRef);
      activeConversationRunMap.delete(normalizedConversationRef);
      if (previousRunId) {
        activeRunConversationMap.delete(previousRunId);
      }
    }
  }

  async function relayRunEvent(backendHttpUrl, runId, eventType, data) {
    await postJson(fetchFn, `${backendHttpUrl}/api/runs/${runId}/events`, {
      event_type: eventType,
      source: 'worker-stream',
      payload: {
        payload: data?.payload || {},
        conversation_ref: data?.conversation_ref || null,
        turn_ref: data?.turn_ref || null,
        session_id: data?.session_id || null,
        user_id: data?.user_id || null,
      },
    }, runsApiHeaders);
  }

  async function onBackendMessage(data) {
    const eventType = normalizeOptionalString(data?.type);
    const conversationRef = normalizeOptionalString(data?.conversation_ref);
    if (!eventType || !conversationRef) {
      return;
    }
    const runId = activeConversationRunMap.get(conversationRef);
    if (!runId) {
      return;
    }
    const connection = getBackendConnectionState();
    const backendHttpUrl = normalizeOptionalString(connection?.backendHttpUrl);
    if (!backendHttpUrl) {
      return;
    }
    try {
      await relayRunEvent(backendHttpUrl, runId, eventType, data);
      if (eventType === 'streaming-complete' || eventType === 'error') {
        clearRunMapping(runId, conversationRef);
      }
    } catch (error) {
      warn(`[VM Worker] Failed to relay run event (${runId}/${eventType}): ${error}`);
    }
  }

  async function dispatchAssignedRun({
    backendHttpUrl,
    userId,
    workerId,
    assignedRun,
  }) {
    const runId = normalizeOptionalString(assignedRun?.run_id);
    const conversationRef = normalizeOptionalString(assignedRun?.conversation_ref);
    const queryText = normalizeOptionalString(assignedRun?.query);
    if (!runId || !conversationRef || !queryText) {
      return;
    }
    if (activeRunConversationMap.has(runId)) {
      return;
    }

    const files = normalizeRunFiles(assignedRun?.files);
    const attachmentContext = buildAttachmentContextFromFiles(files);
    const attachmentFilenames = files
      .map((file) => file.filename)
      .filter((filename) => typeof filename === 'string' && filename.length > 0);

    const result = await sendAutomatedQuery({
      text: queryText,
      conversationRef,
      attachmentContext,
      attachmentFilenames,
    });
    if (!result?.ok) {
      await postJson(fetchFn, `${backendHttpUrl}/api/runs/${runId}/events`, {
        event_type: 'error',
        source: 'worker',
        payload: {
          message: result?.error || 'Failed to dispatch VM run query',
        },
      }, runsApiHeaders);
      return;
    }

    activeConversationRunMap.set(conversationRef, runId);
    activeRunConversationMap.set(runId, conversationRef);

    await postJson(fetchFn, `${backendHttpUrl}/api/runs/${runId}/worker-dispatched`, {
      worker_id: workerId,
      user_id: userId,
      turn_ref: result.queryMessageId || result.messageId,
      conversation_ref: conversationRef,
    }, runsApiHeaders);
  }

  async function applyControlCommands(connection, controlCommands) {
    if (!Array.isArray(controlCommands) || controlCommands.length === 0) {
      return;
    }
    if (typeof sendMessageToBackend !== 'function') {
      return;
    }

    for (const command of controlCommands) {
      if (!command || typeof command !== 'object') {
        continue;
      }
      if (normalizeOptionalString(command.action) !== 'stop') {
        continue;
      }
      const runId = normalizeOptionalString(command.run_id);
      if (!runId) {
        continue;
      }
      const conversationRef = activeRunConversationMap.get(runId);
      if (!conversationRef) {
        continue;
      }
      sendMessageToBackend('stop-query', {
        conversation_ref: conversationRef,
      });
      log(`[VM Worker] Applied stop control for run ${runId}.`);
      const backendHttpUrl = normalizeOptionalString(connection?.backendHttpUrl);
      if (backendHttpUrl) {
        await postJson(fetchFn, `${backendHttpUrl}/api/runs/${runId}/events`, {
          event_type: 'run-control-applied',
          source: 'worker',
          payload: {
            action: 'stop',
            command_id: command.command_id || null,
            conversation_ref: conversationRef,
          },
        }, runsApiHeaders);
      }
    }
  }

  async function heartbeatTick() {
    if (inTick || !active) {
      return;
    }
    inTick = true;
    try {
      const connection = getBackendConnectionState();
      const backendHttpUrl = normalizeOptionalString(connection?.backendHttpUrl);
      const userId = normalizeOptionalString(connection?.userId);
      if (!connection?.isConnected || !backendHttpUrl || !userId) {
        return;
      }

      const workerId = workerIdForUser(userId);
      const vmId = vmIdForWorker(workerId);
      const response = await postJson(fetchFn, `${backendHttpUrl}/api/runs/workers/heartbeat`, {
        workspace_id: workspaceId,
        worker_id: workerId,
        vm_id: vmId,
        user_id: userId,
        session_id: normalizeOptionalString(connection?.sessionId)
          || normalizeOptionalString(connection?.serverUserId)
          || userId,
        agent_id: configuredAgentId,
        status: activeRunConversationMap.size > 0 ? 'running' : 'ready',
        metadata: {
          platform: process.platform,
        },
      }, runsApiHeaders);

      await applyControlCommands(connection, response?.control_commands);

      if (response?.assigned_run) {
        await dispatchAssignedRun({
          backendHttpUrl,
          userId,
          workerId,
          assignedRun: response.assigned_run,
        });
      }
    } catch (error) {
      warn(`[VM Worker] Heartbeat tick failed: ${error}`);
    } finally {
      inTick = false;
    }
  }

  function start() {
    if (active) {
      return;
    }
    active = true;
    removeBackendObserver = registerBackendMessageObserver((data) => {
      void onBackendMessage(data);
    });
    void heartbeatTick();
    intervalId = setIntervalFn(() => {
      void heartbeatTick();
    }, heartbeatMs);
    log(`[VM Worker] Started (workspace=${workspaceId}, heartbeat_ms=${heartbeatMs}).`);
  }

  function stop() {
    active = false;
    if (typeof removeBackendObserver === 'function') {
      removeBackendObserver();
      removeBackendObserver = null;
    }
    if (intervalId) {
      clearIntervalFn(intervalId);
      intervalId = null;
    }
    activeConversationRunMap.clear();
    activeRunConversationMap.clear();
    log('[VM Worker] Stopped.');
  }

  return {
    start,
    stop,
    _internals: {
      normalizeRunFiles,
      buildAttachmentContextFromFiles,
    },
  };
}

module.exports = {
  createVmWorkerRuntime,
};
