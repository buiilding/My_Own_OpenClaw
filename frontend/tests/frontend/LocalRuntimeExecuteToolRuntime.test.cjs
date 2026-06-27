/** @jest-environment node */

jest.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: jest.fn(),
  },
  screen: {
    getAllDisplays: jest.fn(() => []),
    getPrimaryDisplay: jest.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getDisplayMatching: jest.fn(),
  },
}));

const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  createLocalRuntimeExecuteToolRuntime,
} = require('../../src/main/sidecar/local_runtime_execute_tool_runtime.cjs');

describe('local_runtime_execute_tool_runtime', () => {
  test('exports only the local runtime execute-tool factory', () => {
    const executeToolRuntimeModule = require('../../src/main/sidecar/local_runtime_execute_tool_runtime.cjs');

    expect(createLocalRuntimeExecuteToolRuntime).toBeDefined();
    expect(executeToolRuntimeModule[['createLocal', 'BackendExecuteToolRuntime'].join('')]).toBeUndefined();
  });

  test('executes plugin tools through the local runtime path', async () => {
    const sendRequest = jest.fn(async (_method, payload) => ({
      success: true,
      data: {
        output: `${payload.tool_name}:${payload.args.note}`,
      },
    }));

    const runtime = createLocalRuntimeExecuteToolRuntime({
      sendRequest,
      backendHttpUrl: 'http://127.0.0.1:8765',
      getArtifactUploadHeaders: async () => ({}),
      resolveWindows: () => [],
      resolveChatWindow: () => null,
      resolveMainWindow: () => null,
      resolveResponseWindow: () => null,
    });

    const result = await runtime.executeTool(null, {
      toolName: 'summarize_note',
      args: { note: 'hello' },
    });

    expect(sendRequest).toHaveBeenCalledWith(
      'execute_tool',
      {
        tool_name: 'summarize_note',
        args: { note: 'hello' },
      },
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        output: 'summarize_note:hello',
      },
    });
  });

  test('routes MCP tools through the local runtime execution path', async () => {
    const sendRequest = jest.fn(async (_method, payload) => ({
      success: true,
      data: {
        output: `${payload.tool_name}:${payload.args.query}`,
      },
    }));

    const runtime = createLocalRuntimeExecuteToolRuntime({
      sendRequest,
      backendHttpUrl: 'http://127.0.0.1:8765',
      getArtifactUploadHeaders: async () => ({}),
      resolveWindows: () => [],
      resolveChatWindow: () => null,
      resolveMainWindow: () => null,
      resolveResponseWindow: () => null,
    });

    const result = await runtime.executeTool(null, {
      toolName: 'mcp_memory__search',
      args: { query: 'project notes' },
    });

    expect(sendRequest).toHaveBeenCalledWith(
      'execute_tool',
      {
        tool_name: 'mcp_memory__search',
        args: { query: 'project notes' },
      },
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        output: 'mcp_memory__search:project notes',
      },
    });
  });

  test('does not materialize or delete screenshot paths returned by non-screenshot tools', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'agent-mcp-path-'));
    const untrustedPath = path.join(tempDir, 'secret.txt');
    await fsPromises.writeFile(untrustedPath, 'do-not-read-or-delete');

    const originalFetch = global.fetch;
    global.fetch = jest.fn();
    const sendRequest = jest.fn(async () => ({
      success: true,
      data: {
        screenshot_path: untrustedPath,
        output: 'mcp result',
      },
    }));

    const runtime = createLocalRuntimeExecuteToolRuntime({
      sendRequest,
      backendHttpUrl: 'http://127.0.0.1:8765',
      getArtifactUploadHeaders: async () => ({}),
      resolveWindows: () => [],
      resolveChatWindow: () => null,
      resolveMainWindow: () => null,
      resolveResponseWindow: () => null,
    });

    try {
      const result = await runtime.executeTool(null, {
        toolName: 'mcp_memory__search',
        args: { query: 'project notes' },
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        data: {
          output: 'mcp result',
        },
      });
      await expect(fsPromises.readFile(untrustedPath, 'utf8')).resolves.toBe('do-not-read-or-delete');
    } finally {
      global.fetch = originalFetch;
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('does not prepare the desktop surface before normal computer-use tool execution', async () => {
    const sendRequest = jest.fn(async () => ({
      success: true,
      data: {
        output: 'typed',
      },
    }));
    const prepareComputerUseSurface = jest.fn(async () => ({ success: true }));

    const runtime = createLocalRuntimeExecuteToolRuntime({
      sendRequest,
      backendHttpUrl: 'http://127.0.0.1:8765',
      getArtifactUploadHeaders: async () => ({}),
      resolveWindows: () => [],
      resolveChatWindow: () => null,
      resolveMainWindow: () => null,
      resolveResponseWindow: () => null,
      prepareComputerUseSurface,
    });

    const result = await runtime.executeTool(null, {
      toolName: 'keyboard_control',
      args: { action: 'type', text: '123456' },
    });

    expect(prepareComputerUseSurface).not.toHaveBeenCalled();
    expect(sendRequest).toHaveBeenCalledWith(
      'execute_tool',
      {
        tool_name: 'keyboard_control',
        args: { action: 'type', text: '123456' },
      },
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        output: 'typed',
      },
    });
  });
});
