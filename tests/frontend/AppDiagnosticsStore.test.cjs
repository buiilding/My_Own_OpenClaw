/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  APP_DIAGNOSTICS_PATH,
  BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
  MCP_DISCOVERY_DIAGNOSTICS_PATH,
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  MCP_EXECUTION_DIAGNOSTICS_PATH,
  MCP_REGISTRATION_DIAGNOSTICS_PATH,
  PERMISSION_PROBE_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
  diagnosticsDatabasePath,
  inspectDiagnosticTrace,
  queryDiagnosticEvents,
  sanitizeData,
} = require('../../frontend/src/main/diagnostics/app_diagnostics_store.cjs');

describe('app diagnostics store', () => {
  let previousDbPath;
  let tempDir;

  beforeEach(() => {
    previousDbPath = process.env.WINDIE_APP_DIAGNOSTICS_DB;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-diagnostics-'));
    process.env.WINDIE_APP_DIAGNOSTICS_DB = path.join(tempDir, 'diagnostics.db');
  });

  afterEach(() => {
    if (previousDbPath === undefined) {
      delete process.env.WINDIE_APP_DIAGNOSTICS_DB;
    } else {
      process.env.WINDIE_APP_DIAGNOSTICS_DB = previousDbPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('persists and queries sanitized app diagnostics', () => {
    const stored = appendDiagnosticEvent({
      traceId: 'diag-test',
      spanId: 'span-test',
      path: APP_DIAGNOSTICS_PATH,
      stage: 'store_list',
      status: 'failed',
      runtime: 'sidecar',
      requestId: 'req-test',
      durationMs: 12,
      data: {
        canonicalHistoryDbExists: false,
        legacyEpisodicDbExists: true,
        resultCount: 0,
        workspacePath: '/do/not/store',
        title: 'do not store',
      },
      error: new Error('sqlite failed at /private/path'),
    });

    expect(stored).toEqual(expect.objectContaining({
      stored: true,
      database: diagnosticsDatabasePath(),
      traceId: 'diag-test',
      spanId: 'span-test',
    }));

    const events = queryDiagnosticEvents({ pathFilter: APP_DIAGNOSTICS_PATH, limit: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'diag-test',
      stage: 'store_list',
      status: 'failed',
      runtime: 'sidecar',
      requestId: 'req-test',
      durationMs: 12,
      data: expect.objectContaining({
        canonicalHistoryDbExists: false,
        legacyEpisodicDbExists: true,
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

    expect(inspectDiagnosticTrace('diag-test')).toHaveLength(1);
  });

  test('sanitizes data with an allowlist', () => {
    expect(sanitizeData({
      hasUserId: true,
      resultCount: 2,
      localBackendReady: true,
      action: 'connect',
      tabCount: 1,
      lastMessage: 'secret',
      workspacePath: '/repo',
      title: 'chat title',
      url: 'https://example.com/private',
    })).toEqual({
      hasUserId: true,
      resultCount: 2,
      localBackendReady: true,
      action: 'connect',
      tabCount: 1,
    });
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
        localBackendReady: true,
        ready: true,
        action: 'connect',
        tabCount: 2,
        title: 'do not store',
        url: 'https://example.com/private',
        workspacePath: '/Users/peter/private',
      },
    });

    const events = queryDiagnosticEvents({
      pathFilter: BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      traceId: 'browser-diag-test',
      stage: 'status_bootstrap',
      data: expect.objectContaining({
        localBackendReady: true,
        ready: true,
        action: 'connect',
        tabCount: 2,
      }),
    }));
    expect(JSON.stringify(events[0])).not.toContain('do not store');
    expect(JSON.stringify(events[0])).not.toContain('example.com/private');
    expect(JSON.stringify(events[0])).not.toContain('/Users/peter/private');
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

    const events = queryDiagnosticEvents({
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
      runtime: 'sidecar',
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

    const events = queryDiagnosticEvents({
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

    const events = queryDiagnosticEvents({
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
      runtime: 'sidecar',
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

    const events = queryDiagnosticEvents({
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

    const events = queryDiagnosticEvents({
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
