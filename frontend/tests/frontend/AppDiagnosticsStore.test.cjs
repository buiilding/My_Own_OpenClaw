/** @jest-environment node */

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  APP_DIAGNOSTICS_PATH,
  BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
  DESKTOP_STARTUP_DIAGNOSTICS_PATH,
  IPC_BRIDGE_DIAGNOSTICS_PATH,
  LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH,
  MCP_DISCOVERY_DIAGNOSTICS_PATH,
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  PERMISSION_PROBE_DIAGNOSTICS_PATH,
  RENDERER_DISPLAY_PROJECTION_DIAGNOSTICS_PATH,
  RENDERER_INTERACTION_DIAGNOSTICS_PATH,
  SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
  WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
  configureAppDiagnosticsStore,
  listDiagnosticPathDefinitions,
} = require('../../src/main/diagnostics/app_diagnostics_store.cjs');

const MCP_EXECUTION_DIAGNOSTICS_PATH = 'mcp.execution';
const MCP_REGISTRATION_DIAGNOSTICS_PATH = 'mcp.registration';
const SAMPLE_WAKEWORD_MODEL = 'sample_wakeword';
const sampleDiagnosticsConfig = Object.freeze({
  dataPaths: Object.freeze({
    appDataDirName: 'sample-agent',
    env: Object.freeze({
      diagnosticsDb: 'SAMPLE_APP_DIAGNOSTICS_DB',
      userDataDir: 'SAMPLE_USER_DATA_DIR',
    }),
  }),
  localRuntimeErrorMarkers: Object.freeze(['sample-local-runtime']),
});
const windieDiagnosticsDbEnv = ['WINDIE', 'APP', 'DIAGNOSTICS', 'DB'].join('_');
const windieUserDataDirEnv = ['WINDIE', 'USER', 'DATA', 'DIR'].join('_');

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseJsonField(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readDiagnosticEvents({ pathFilter = '', traceId = '', limit = 50 } = {}) {
  const dbPath = process.env.SAMPLE_APP_DIAGNOSTICS_DB;
  const conditions = [];
  if (pathFilter) {
    conditions.push(`path = ${sqlString(pathFilter)}`);
  }
  if (traceId) {
    conditions.push(`trace_id = ${sqlString(traceId)}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 1000);
  const result = childProcess.spawnSync('sqlite3', ['-json', dbPath, `
    SELECT id,
           trace_id AS traceId,
           span_id AS spanId,
           parent_span_id AS parentSpanId,
           path,
           stage,
           status,
           runtime,
           timestamp,
           duration_ms AS durationMs,
           request_id AS requestId,
           session_id AS sessionId,
           conversation_ref AS conversationRef,
           data,
           error
    FROM diagnostic_events
    ${where}
    ORDER BY timestamp DESC
    LIMIT ${safeLimit}
  `], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `sqlite3 exited with status ${result.status}`);
  }
  return JSON.parse(result.stdout || '[]').map(row => ({
    id: row.id,
    traceId: row.traceId,
    spanId: row.spanId,
    parentSpanId: row.parentSpanId || null,
    path: row.path,
    stage: row.stage,
    status: row.status,
    runtime: row.runtime,
    timestamp: row.timestamp,
    durationMs: Number.isFinite(row.durationMs) ? row.durationMs : null,
    requestId: row.requestId || null,
    sessionId: row.sessionId || null,
    conversationRef: row.conversationRef || null,
    data: parseJsonField(row.data) || {},
    error: parseJsonField(row.error),
  }));
}

describe('app diagnostics store', () => {
  let previousDbPath;
  let tempDir;

  beforeEach(() => {
    configureAppDiagnosticsStore(sampleDiagnosticsConfig);
    previousDbPath = process.env.SAMPLE_APP_DIAGNOSTICS_DB;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-diagnostics-'));
    process.env.SAMPLE_APP_DIAGNOSTICS_DB = path.join(tempDir, 'diagnostics.db');
  });

  afterEach(() => {
    configureAppDiagnosticsStore(sampleDiagnosticsConfig);
    if (previousDbPath === undefined) {
      delete process.env.SAMPLE_APP_DIAGNOSTICS_DB;
    } else {
      process.env.SAMPLE_APP_DIAGNOSTICS_DB = previousDbPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('exports local runtime diagnostic owners without backend alias', () => {
    expect(LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH).toBe('local_runtime.lifecycle');
    expect(listDiagnosticPathDefinitions()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: APP_DIAGNOSTICS_PATH,
        owner: 'SDK + local runtime conversation store',
      }),
      expect.objectContaining({
        path: BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
        owner: 'Electron main local runtime bridge',
      }),
      expect.objectContaining({
        path: LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH,
        owner: 'Electron main local runtime bridge',
      }),
      expect.objectContaining({
        path: MCP_DISCOVERY_DIAGNOSTICS_PATH,
        owner: 'Electron main and local-runtime MCP adapters',
      }),
      expect.objectContaining({
        path: MCP_EXECUTION_DIAGNOSTICS_PATH,
        owner: 'Python local-runtime MCP adapter',
      }),
      expect.objectContaining({
        path: MCP_REGISTRATION_DIAGNOSTICS_PATH,
        owner: 'Python local-runtime MCP adapter',
      }),
      expect.objectContaining({
        path: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
        purpose: 'MCP dashboard enablement toggles and desktop UI config persistence lifecycle.',
      }),
      expect.objectContaining({
        path: RENDERER_DISPLAY_PROJECTION_DIAGNOSTICS_PATH,
        owner: 'Renderer display-row projection runtime through Electron main',
      }),
    ]));
  });

  test('persists and queries sanitized app diagnostics', () => {
    const stored = appendDiagnosticEvent({
      traceId: 'diag-test',
      spanId: 'span-test',
      path: APP_DIAGNOSTICS_PATH,
      stage: 'store_list',
      status: 'failed',
      runtime: 'local-runtime',
      requestId: 'req-test',
      durationMs: 12,
      data: {
        canonicalHistoryDbExists: false,
        resultCount: 0,
        workspacePath: '/do/not/store',
        title: 'do not store',
      },
      error: new Error('sqlite failed at /private/path'),
    });

    expect(stored).toEqual(expect.objectContaining({
      stored: true,
      database: process.env.SAMPLE_APP_DIAGNOSTICS_DB,
      traceId: 'diag-test',
      spanId: 'span-test',
    }));

    const events = readDiagnosticEvents({ pathFilter: APP_DIAGNOSTICS_PATH, limit: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'diag-test',
      stage: 'store_list',
      status: 'failed',
      runtime: 'local-runtime',
      requestId: 'req-test',
      durationMs: 12,
      data: expect.objectContaining({
        canonicalHistoryDbExists: false,
        resultCount: 0,
        durationMs: 12,
      }),
      error: expect.objectContaining({
        code: 'sqlite_error',
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('/do/not/store');
    expect(JSON.stringify(events[0])).not.toContain('/private/path');
    expect(JSON.stringify(events[0])).not.toContain('do not store');

    expect(readDiagnosticEvents({ traceId: 'diag-test' })).toHaveLength(1);
  });

  test('persists sanitized browser session control diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'browser-diag-test',
      spanId: 'browser-span-test',
      path: BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
      stage: 'status_bootstrap',
      status: 'succeeded',
      runtime: 'electron-main',
      data: {
        localRuntimeReady: true,
        ready: true,
        action: 'connect',
        tabCount: 2,
        title: 'do not store',
        url: 'https://example.com/private',
        workspacePath: '/Users/peter/private',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'browser-diag-test',
      stage: 'status_bootstrap',
      data: expect.objectContaining({
        localRuntimeReady: true,
        ready: true,
        action: 'connect',
        tabCount: 2,
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('do not store');
    expect(JSON.stringify(events[0])).not.toContain('example.com/private');
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
  });

  test('diagnostics runtime exports local runtime lifecycle helper without backend alias', () => {
    const runtime = require('../../src/main/diagnostics/app_diagnostics_runtime.cjs');

    expect(typeof runtime.appendLocalRuntimeLifecycleDiagnostic).toBe('function');
    expect(runtime.appendLocalBackendLifecycleDiagnostic).toBeUndefined();
  });

  test('diagnostics sanitizers do not allow retired local-runtime readiness fields for new rows', () => {
    const runtimeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/diagnostics/app_diagnostics_runtime.cjs'),
      'utf8',
    );
    const storeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/diagnostics/app_diagnostics_store.cjs'),
      'utf8',
    );

    expect(runtimeSource).not.toContain('sidecarReady');
    expect(storeSource).not.toContain("'sidecarReady'");
  });

  test('diagnostics error classifier emits generic local runtime code', () => {
    const storeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/diagnostics/app_diagnostics_store.cjs'),
      'utf8',
    );

    expect(storeSource).toContain("return 'local_runtime_unavailable';");
    expect(storeSource).toContain("'local runtime'");
    expect(storeSource).toContain("'local-runtime'");
    expect(storeSource).not.toContain("return 'sidecar_unavailable';");
    expect(storeSource).not.toContain('sidecar');
  });

  test('diagnostics data path env names are supplied by host config', () => {
    const storeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/diagnostics/app_diagnostics_store.cjs'),
      'utf8',
    );

    expect(storeSource).toContain('dataPathConfig');
    expect(storeSource).toContain('AGENT_APP_DIAGNOSTICS_DB');
    expect(storeSource).toContain('AGENT_USER_DATA_DIR');
    expect(storeSource).not.toContain(windieDiagnosticsDbEnv);
    expect(storeSource).not.toContain(windieUserDataDirEnv);
  });

  test('persists sanitized surface visibility diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'surface-diag-test',
      spanId: 'surface-span-test',
      path: SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
      stage: 'hide-from-phase',
      status: 'succeeded',
      runtime: 'electron-main',
      data: {
        action: 'hide-from-phase',
        mode: 'hidden',
        phase: 'idle',
        responseWindowVisible: false,
        responseOverlayVisibleFlag: false,
        width: 520,
        height: 236,
        title: 'do not store',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'surface-diag-test',
      stage: 'hide-from-phase',
      data: expect.objectContaining({
        action: 'hide-from-phase',
        mode: 'hidden',
        phase: 'idle',
        responseWindowVisible: false,
        responseOverlayVisibleFlag: false,
        width: 520,
        height: 236,
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('do not store');
  });

  test('persists sanitized renderer interaction diagnostics without labels', () => {
    appendDiagnosticEvent({
      traceId: 'interaction-diag-test',
      spanId: 'interaction-span-test',
      path: RENDERER_INTERACTION_DIAGNOSTICS_PATH,
      stage: 'button_clicked',
      status: 'succeeded',
      runtime: 'renderer',
      conversationRef: 'conv-1',
      data: {
        action: 'button_clicked',
        event: 'click',
        view: 'minimal-chat-pill',
        targetTag: 'button',
        targetType: 'button',
        hasTargetLabel: true,
        label: 'do not store',
        messageText: 'do not store either',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: RENDERER_INTERACTION_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'interaction-diag-test',
      stage: 'button_clicked',
      conversationRef: 'conv-1',
      data: expect.objectContaining({
        action: 'button_clicked',
        event: 'click',
        view: 'minimal-chat-pill',
        targetTag: 'button',
        targetType: 'button',
        hasTargetLabel: true,
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('do not store');
  });

  test('persists sanitized renderer display projection diagnostics without content', () => {
    expect(RENDERER_DISPLAY_PROJECTION_DIAGNOSTICS_PATH).toBe('renderer.display_projection');

    appendDiagnosticEvent({
      traceId: 'display-projection-diag-test',
      spanId: 'display-projection-span-test',
      path: RENDERER_DISPLAY_PROJECTION_DIAGNOSTICS_PATH,
      stage: 'projected',
      status: 'succeeded',
      runtime: 'renderer',
      conversationRef: 'conv-1',
      data: {
        action: 'display_rows_projected',
        event: 'renderer.display_rows.projected',
        source: 'dashboard-open-conversation',
        rowCount: 2,
        sdkUserRowCount: 1,
        sdkUserRowsWithImages: 1,
        sdkUserImageCount: 1,
        sdkMessageCount: 2,
        sdkProjectedUserMessageCount: 1,
        sdkProjectedUserMessagesWithImages: 1,
        sdkProjectedUserImageCount: 1,
        currentMessageCount: 1,
        currentOptimisticUserCount: 1,
        mergedMessageCount: 2,
        mergedUserMessageCount: 1,
        mergedUserMessagesWithImages: 1,
        mergedUserImageCount: 1,
        screenshotUrl: 'https://example.com/do-not-store.png',
        screenshotBytes: 'do-not-store',
        messageText: 'do not store',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: RENDERER_DISPLAY_PROJECTION_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'display-projection-diag-test',
      stage: 'projected',
      runtime: 'renderer',
      conversationRef: 'conv-1',
      data: expect.objectContaining({
        action: 'display_rows_projected',
        event: 'renderer.display_rows.projected',
        source: 'dashboard-open-conversation',
        rowCount: 2,
        sdkUserImageCount: 1,
        sdkProjectedUserImageCount: 1,
        currentOptimisticUserCount: 1,
        mergedUserImageCount: 1,
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('example.com/do-not-store');
    expect(JSON.stringify(events[0])).not.toContain('do-not-store');
    expect(JSON.stringify(events[0])).not.toContain('do not store');
  });

  test('persists sanitized desktop startup diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'startup-diag-test',
      path: DESKTOP_STARTUP_DIAGNOSTICS_PATH,
      stage: 'metrics_snapshot',
      runtime: 'electron-main',
      data: {
        action: 'metrics_snapshot',
        startupLabel: 'startup-ready',
        pid: 4242,
        rssMb: 12.5,
        heapUsedMb: 4.5,
        appProcessCount: 3,
        browserProcessCount: 1,
        rendererProcessCount: 1,
        appWorkingSetMb: 220,
        commandLine: '--do-not-store',
        workspacePath: '/Users/peter/private',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: DESKTOP_STARTUP_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual(expect.objectContaining({
      action: 'metrics_snapshot',
      startupLabel: 'startup-ready',
      pid: 4242,
      rssMb: 12.5,
      heapUsedMb: 4.5,
      appProcessCount: 3,
      browserProcessCount: 1,
      rendererProcessCount: 1,
      appWorkingSetMb: 220,
    }));
    expect(JSON.stringify(events[0])).not.toContain('--do-not-store');
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
  });

  test('persists sanitized ipc bridge diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'ipc-diag-test',
      path: IPC_BRIDGE_DIAGNOSTICS_PATH,
      stage: 'settings.update.send',
      runtime: 'electron-main',
      requestId: 'settings-1',
      conversationRef: 'conv-1',
      data: {
        action: 'settings.update.send',
        phase: 'settings',
        source: 'renderer',
        requestId: 'settings-1',
        turnRef: 'turn-1',
        textLength: 15,
        resourceCount: 2,
        updatedKeys: 'model_provider,selected_model_id',
        provider: 'openai',
        model: 'gpt-4.1',
        modelMode: 'online',
        providerApiKey: 'do-not-store',
        promptText: 'do not store',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: IPC_BRIDGE_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'ipc-diag-test',
      requestId: 'settings-1',
      conversationRef: 'conv-1',
      data: expect.objectContaining({
        action: 'settings.update.send',
        phase: 'settings',
        source: 'renderer',
        turnRef: 'turn-1',
        textLength: 15,
        resourceCount: 2,
        updatedKeys: 'model_provider,selected_model_id',
        provider: 'openai',
        model: 'gpt-4.1',
        modelMode: 'online',
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('do-not-store');
    expect(JSON.stringify(events[0])).not.toContain('do not store');
  });

  test('persists sanitized local runtime lifecycle diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'local-runtime-diag-test',
      path: LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH,
      stage: 'bridge_initialized',
      runtime: 'electron-main',
      data: {
        action: 'bridge_initialized',
        status: 'ready',
        ready: true,
        localRuntimeReady: true,
        hasClient: true,
        hasDiscoveryPath: true,
        discoveryPath: '/Users/peter/private',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual(expect.objectContaining({
      action: 'bridge_initialized',
      status: 'ready',
      ready: true,
      localRuntimeReady: true,
      hasClient: true,
      hasDiscoveryPath: true,
    }));
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
  });

  test('persists sanitized wakeword lifecycle diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'wakeword-diag-test',
      path: WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH,
      stage: 'detected',
      runtime: 'electron-main',
      data: {
        action: 'detected',
        phase: 'stdout',
        launchKind: 'python',
        packaged: false,
        processPid: 1234,
        ready: true,
        enabled: true,
        modelId: SAMPLE_WAKEWORD_MODEL,
        confidence: 0.9,
        score: 0.8,
        transcript: 'do not store',
        audioBytes: 'do not store',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual(expect.objectContaining({
      action: 'detected',
      phase: 'stdout',
      launchKind: 'python',
      packaged: false,
      processPid: 1234,
      ready: true,
      enabled: true,
      modelId: SAMPLE_WAKEWORD_MODEL,
      confidence: 0.9,
      score: 0.8,
    }));
    expect(JSON.stringify(events[0])).not.toContain('do not store');
  });

  test('persists sanitized MCP discovery diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'mcp-diag-test',
      spanId: 'mcp-span-test',
      path: MCP_DISCOVERY_DIAGNOSTICS_PATH,
      stage: 'request_timeout',
      status: 'failed',
      runtime: 'electron-main',
      durationMs: 15000,
      data: {
        serverId: 'cua-driver',
        command: 'cua-driver',
        args: '["mcp"]',
        phase: 'initialize',
        timeoutMs: 15000,
        elapsedMs: 15000,
        stderrTail: 'startup warning',
        workspacePath: '/Users/peter/private',
      },
      error: new Error('MCP initialize timed out for cua-driver at /private/path'),
    });

    const events = readDiagnosticEvents({
      pathFilter: MCP_DISCOVERY_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'mcp-diag-test',
      stage: 'request_timeout',
      status: 'failed',
      durationMs: 15000,
      data: expect.objectContaining({
        serverId: 'cua-driver',
        command: 'cua-driver',
        args: '["mcp"]',
        phase: 'initialize',
        timeoutMs: 15000,
        elapsedMs: 15000,
        stderrTail: 'startup warning',
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
    expect(JSON.stringify(events[0])).not.toContain('/private/path');
  });

  test('persists sanitized MCP execution diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'mcp-exec-test',
      spanId: 'mcp-exec-span',
      path: MCP_EXECUTION_DIAGNOSTICS_PATH,
      stage: 'tool_call_succeeded',
      status: 'succeeded',
      runtime: 'local-runtime',
      requestId: 'req-1',
      conversationRef: 'conv-1',
      durationMs: 9,
      data: {
        serverId: 'notes',
        phase: 'tools_call',
        exposedToolName: 'mcp_notes__remember',
        mcpToolName: 'remember',
        toolCallId: 'call-1',
        correlationId: 'corr-1',
        bundleId: 'bundle-1',
        turnRef: 'turn-1',
        arguments: { value: 'do not store' },
        result: 'remember:do not store',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: MCP_EXECUTION_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'mcp-exec-test',
      stage: 'tool_call_succeeded',
      status: 'succeeded',
      requestId: 'req-1',
      conversationRef: 'conv-1',
      data: expect.objectContaining({
        serverId: 'notes',
        phase: 'tools_call',
        exposedToolName: 'mcp_notes__remember',
        mcpToolName: 'remember',
        toolCallId: 'call-1',
        correlationId: 'corr-1',
        bundleId: 'bundle-1',
        turnRef: 'turn-1',
        durationMs: 9,
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('do not store');
    expect(events[0].data.arguments).toBeUndefined();
    expect(events[0].data.result).toBeUndefined();
  });

  test('persists sanitized MCP enablement diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'mcp-enable-test',
      spanId: 'mcp-enable-span',
      path: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
      stage: 'config_saved',
      status: 'succeeded',
      runtime: 'electron-main',
      data: {
        phase: 'config_save',
        serverId: 'mcp:cua-driver',
        requestedEnabled: true,
        preserveMcpEnablement: true,
        preserveSource: 'disk',
        payloadHasEnabledKey: false,
        latestHasEnabledKey: false,
        enabledServerCount: 1,
        persistedEnabledServerCount: 1,
        payloadEnabledServerCount: 0,
        rawConfig: { agent_enabled_mcp_servers: ['do not store'] },
        workspacePath: '/Users/peter/private',
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'mcp-enable-test',
      stage: 'config_saved',
      status: 'succeeded',
      data: expect.objectContaining({
        phase: 'config_save',
        serverId: 'mcp:cua-driver',
        requestedEnabled: true,
        preserveMcpEnablement: true,
        preserveSource: 'disk',
        payloadHasEnabledKey: false,
        latestHasEnabledKey: false,
        enabledServerCount: 1,
        persistedEnabledServerCount: 1,
        payloadEnabledServerCount: 0,
      }),
    }));
    expect(events[0].data.rawConfig).toBeUndefined();
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
  });

  test('persists sanitized MCP registration diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'mcp-registration-test',
      spanId: 'mcp-registration-span',
      path: MCP_REGISTRATION_DIAGNOSTICS_PATH,
      stage: 'registration_completed',
      status: 'succeeded',
      runtime: 'local-runtime',
      durationMs: 21,
      data: {
        phase: 'registration',
        replace: true,
        requestedServerCount: 1,
        registeredServerCount: 1,
        registeredToolCount: 35,
        statusCount: 1,
        errorCount: 0,
        mcpServerCount: 1,
        mcpToolCount: 35,
        rawServers: [{ command: '/Users/peter/private/cua-driver' }],
      },
    });

    const events = readDiagnosticEvents({
      pathFilter: MCP_REGISTRATION_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'mcp-registration-test',
      stage: 'registration_completed',
      status: 'succeeded',
      durationMs: 21,
      data: expect.objectContaining({
        phase: 'registration',
        replace: true,
        requestedServerCount: 1,
        registeredServerCount: 1,
        registeredToolCount: 35,
        statusCount: 1,
        errorCount: 0,
        mcpServerCount: 1,
        mcpToolCount: 35,
        durationMs: 21,
      }),
    }));
    expect(events[0].data.rawServers).toBeUndefined();
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
  });

  test('persists sanitized permission probe diagnostics', () => {
    appendDiagnosticEvent({
      traceId: 'permission-diag-test',
      spanId: 'permission-span-test',
      path: PERMISSION_PROBE_DIAGNOSTICS_PATH,
      stage: 'workspace_activate',
      status: 'succeeded',
      runtime: 'electron-main',
      durationMs: 18,
      data: {
        permissionId: 'filesystem_workspace_access',
        permissionStatus: 'granted',
        granted: true,
        hasDetails: true,
        platform: 'darwin',
        hasWorkspacePath: true,
        selected_paths: ['/Users/peter/private'],
        workspacePath: '/Users/peter/private',
        promptText: 'Workspace access prompt',
        url: 'https://example.com/private',
      },
      error: new Error('permission path failed at /Users/peter/private'),
    });

    const events = readDiagnosticEvents({
      pathFilter: PERMISSION_PROBE_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'permission-diag-test',
      stage: 'workspace_activate',
      status: 'succeeded',
      runtime: 'electron-main',
      durationMs: 18,
      data: expect.objectContaining({
        permissionId: 'filesystem_workspace_access',
        permissionStatus: 'granted',
        granted: true,
        hasDetails: true,
        platform: 'darwin',
        hasWorkspacePath: true,
        durationMs: 18,
      }),
      error: expect.objectContaining({
        message: expect.stringContaining('[path]'),
      }),
    }));
    expect(events[0].data.selected_paths).toBeUndefined();
    expect(events[0].data.workspacePath).toBeUndefined();
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
    expect(JSON.stringify(events[0])).not.toContain('Workspace access prompt');
    expect(JSON.stringify(events[0])).not.toContain('example.com/private');
  });

});
