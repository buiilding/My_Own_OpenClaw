/** @jest-environment node */

const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  createWindow,
  getLastWrittenRequest,
  initBridge,
  markReady,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/localBackendBridgeHarness.cjs');

describe('local_backend_bridge RPC handlers', () => {
  registerBridgeSuiteLifecycleHooks();

  function emitRpcMessage(stdoutHandler, payload) {
    stdoutHandler()(Buffer.from(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-1',
      ...payload,
    })}\n`));
  }

  function emitRpcResult(stdoutHandler, result) {
    emitRpcMessage(stdoutHandler, { result });
  }

  function emitRpcError(stdoutHandler, message) {
    emitRpcMessage(stdoutHandler, { error: { message } });
  }

  async function expectResolvedSuccess(stdoutHandler, promise, data) {
    emitRpcResult(stdoutHandler, { success: true, data });
    await expect(promise).resolves.toEqual({ success: true, data });
  }

  function expectLastRequestWith(method, params) {
    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method,
        params,
      }),
    );
  }

  test('execute-tool handler returns success for valid response', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['execute-tool'](null, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { value: 1 } });

    const result = await promise;
    expect(result).toEqual({ success: true, data: { value: 1 } });
  });

  test('browser warmup sends a valid connect payload with explanation', async () => {
    const { bridge, stdoutHandler } = initBridge();
    markReady();

    const promise = bridge.warmBrowserAutomation();

    expectLastRequestWith('execute_tool', {
      tool_name: 'browser',
      args: {
        action: 'connect',
        explanation: 'Open the WindieOS browser for onboarding and profile setup.',
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { connected: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { success: true, data: { connected: true } } });
  });

  test('execute-tool handles large JSON-RPC stdout lines', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const largePayload = 'x'.repeat(140 * 1024);
    const promise = handlers['execute-tool'](null, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    emitRpcResult(stdoutHandler, {
      success: true,
      data: { large_payload: largePayload },
    });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.data.large_payload).toHaveLength(140 * 1024);
  });

  test('execute-tool uploads screenshot temp-path responses and returns artifact refs', async () => {
    const { handlers, stdoutHandler } = initBridge({
      getArtifactUploadHeaders: async () => ({
        Authorization: 'Bearer test-install-token',
      }),
    });
    markReady();

    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-shot-'));
    const screenshotPath = path.join(tempDir, 'capture.jpg');
    await fsPromises.writeFile(screenshotPath, Buffer.from('fake-jpeg-bytes'));

    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        artifact_id: 'artifact-1',
        url: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
      }),
    });
    global.fetch = fetchMock;

    try {
      const promise = handlers['execute-tool'](null, {
        toolName: 'screenshot',
        args: {},
      });

      emitRpcResult(stdoutHandler, {
        success: true,
        data: {
          screenshot_path: screenshotPath,
          screenshot_content_type: 'image/jpeg',
          compression: 'jpeg',
        },
      });

      await expect(promise).resolves.toEqual({
        success: true,
        data: {
          screenshot_content_type: 'image/jpeg',
          compression: 'jpeg',
          screenshot_ref: 'artifact-1',
          screenshot_url: 'http://127.0.0.1:8765/api/artifacts/artifact-1',
        },
      });

      expect(fetchMock).toHaveBeenCalled();
      const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0];
      if (String(uploadUrl) !== 'https://api.windieos.com/api/artifacts/') {
        throw new Error(`unexpected upload url: ${String(uploadUrl)}`);
      }
      if (uploadOptions?.method !== 'POST') {
        throw new Error(`unexpected upload method: ${String(uploadOptions?.method)}`);
      }
      expect(uploadOptions?.headers).toEqual({
        Authorization: 'Bearer test-install-token',
      });
      await expect(fsPromises.access(screenshotPath)).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('execute-tool injects active display affinity for screenshot capture when sender window is hidden', async () => {
    const { handlers, stdoutHandler, mainWindow } = initBridge();
    markReady();

    mainWindow.isVisible.mockReturnValue(false);
    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/display_affinity_runtime.cjs');
    setActiveDisplayAffinity({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });

    const promise = handlers['execute-tool']({ sender: {} }, {
      toolName: 'screenshot',
      args: { explanation: 'Current monitor' },
    });

    expectLastRequestWith('execute_tool', {
      tool_name: 'screenshot',
      args: {
        explanation: 'Current monitor',
        display_bounds: {
          x: 1920,
          y: 0,
          width: 2560,
          height: 1440,
          monitor_id: '2',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { ok: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { ok: true } });
  });

  test('execute-tool prefers visible chat window display bounds over stale active affinity when sender window is hidden', async () => {
    const chatWindow = createWindow({
      getBounds: jest.fn(() => ({ x: 1920, y: 0, width: 900, height: 600 })),
    });
    const { handlers, stdoutHandler, mainWindow } = initBridge({ chatWindow });
    markReady();

    mainWindow.isVisible.mockReturnValue(false);

    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/display_affinity_runtime.cjs');
    const electron = require('electron');
    electron.screen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        id: 2,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      },
    ]);
    electron.screen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    });
    electron.screen.getDisplayMatching.mockImplementation((bounds) => {
      if (bounds && bounds.x >= 1920) {
        return {
          id: 2,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        };
      }
      return {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      };
    });
    setActiveDisplayAffinity({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });

    const promise = handlers['execute-tool']({ sender: {} }, {
      toolName: 'screenshot',
      args: { explanation: 'Current monitor' },
    });

    expectLastRequestWith('execute_tool', {
      tool_name: 'screenshot',
      args: {
        explanation: 'Current monitor',
        display_bounds: {
          x: 1920,
          y: 0,
          width: 2560,
          height: 1440,
          monitor_id: '2',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { ok: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { ok: true } });
  });

  test('execute-tool injects visible chat window display bounds into direct screenshot requests', async () => {
    const chatWindow = createWindow({
      getBounds: jest.fn(() => ({ x: 1920, y: 0, width: 900, height: 600 })),
    });
    const { handlers, stdoutHandler, mainWindow } = initBridge({ chatWindow });
    markReady();

    mainWindow.isVisible.mockReturnValue(false);

    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/display_affinity_runtime.cjs');
    const electron = require('electron');
    electron.screen.getAllDisplays.mockReturnValue([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        id: 2,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      },
    ]);
    electron.screen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    });
    electron.screen.getDisplayMatching.mockImplementation((bounds) => {
      if (bounds && bounds.x >= 1920) {
        return {
          id: 2,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        };
      }
      return {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      };
    });
    setActiveDisplayAffinity({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });

    const promise = handlers['execute-tool']({ sender: {} }, {
      toolName: 'screenshot',
      args: {
        explanation: 'Current monitor',
      },
    });

    expectLastRequestWith('execute_tool', {
      tool_name: 'screenshot',
      args: {
        explanation: 'Current monitor',
        display_bounds: {
          x: 1920,
          y: 0,
          width: 2560,
          height: 1440,
          monitor_id: '2',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { ok: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { ok: true } });
  });

  test('execute-tool ignores visible response overlay when resolving screenshot monitor fallback', async () => {
    const responseWindow = createWindow({
      getBounds: jest.fn(() => ({ x: 1920, y: 0, width: 900, height: 600 })),
    });
    const { handlers, stdoutHandler, mainWindow } = initBridge({ responseWindow });
    markReady();

    mainWindow.isVisible.mockReturnValue(false);

    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/display_affinity_runtime.cjs');
    setActiveDisplayAffinity({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });

    const promise = handlers['execute-tool']({ sender: {} }, {
      toolName: 'screenshot',
      args: { explanation: 'Current monitor' },
    });

    expectLastRequestWith('execute_tool', {
      tool_name: 'screenshot',
      args: {
        explanation: 'Current monitor',
        display_bounds: {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          monitor_id: '1',
          desktop_virtual_bounds: {
            x: 0,
            y: 0,
            width: 4480,
            height: 1440,
          },
        },
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { ok: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { ok: true } });
  });

  test('execute-tool falls back to inline screenshot when screenshot-path artifact upload fails', async () => {
    const { handlers, stdoutHandler } = initBridge({
      getArtifactUploadHeaders: async () => ({
        Authorization: 'Bearer test-install-token',
      }),
    });
    markReady();

    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-shot-inline-'));
    const screenshotPath = path.join(tempDir, 'capture.jpg');
    await fsPromises.writeFile(screenshotPath, Buffer.from('fake-jpeg-inline'));

    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'artifact store offline',
    });
    global.fetch = fetchMock;

    try {
      const promise = handlers['execute-tool'](null, {
        toolName: 'screenshot',
        args: {},
      });

      emitRpcResult(stdoutHandler, {
        success: true,
        data: {
          screenshot_path: screenshotPath,
          screenshot_content_type: 'image/jpeg',
        },
      });

      await expect(promise).resolves.toEqual({
        success: true,
        data: {
          screenshot: Buffer.from('fake-jpeg-inline').toString('base64'),
          screenshot_content_type: 'image/jpeg',
        },
      });

      expect(fetchMock).toHaveBeenCalled();
      const [uploadUrl, uploadOptions] = fetchMock.mock.calls[0];
      if (String(uploadUrl) !== 'https://api.windieos.com/api/artifacts/') {
        throw new Error(`unexpected upload url: ${String(uploadUrl)}`);
      }
      if (uploadOptions?.method !== 'POST') {
        throw new Error(`unexpected upload method: ${String(uploadOptions?.method)}`);
      }
      expect(uploadOptions?.headers).toEqual({
        Authorization: 'Bearer test-install-token',
      });
      await expect(fsPromises.access(screenshotPath)).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('execute-tool injects native sudo auth mode when full sudo access is enabled', async () => {
    const { handlers, stdoutHandler } = initBridge({
      frontendConfig: { agent_full_sudo_enabled: true },
    });
    markReady();

    const promise = handlers['execute-tool'](null, {
      toolName: 'run_shell_command',
      args: { command: 'sudo apt update', run_in_background: false },
    });

    expectLastRequestWith('execute_tool', {
      tool_name: 'run_shell_command',
      args: {
        command: 'sudo apt update',
        run_in_background: false,
        sudo_auth_mode: 'native',
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { value: 1 } });
    await expect(promise).resolves.toEqual({ success: true, data: { value: 1 } });
  });

  test('execute-tool injects os_prompt sudo auth mode when full sudo access is disabled', async () => {
    const { handlers, stdoutHandler } = initBridge({
      frontendConfig: { agent_full_sudo_enabled: false },
    });
    markReady();

    const promise = handlers['execute-tool'](null, {
      toolName: 'run_shell_command',
      args: { command: 'sudo apt update', run_in_background: false },
    });

    expectLastRequestWith('execute_tool', {
      tool_name: 'run_shell_command',
      args: {
        command: 'sudo apt update',
        run_in_background: false,
        sudo_auth_mode: 'os_prompt',
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { value: 1 } });
    await expect(promise).resolves.toEqual({ success: true, data: { value: 1 } });
  });

  test('execute-tool does not mutate caller run_shell_command args when injecting sudo mode', async () => {
    const { handlers, stdoutHandler } = initBridge({
      frontendConfig: { agent_full_sudo_enabled: true },
    });
    markReady();

    const callerArgs = { command: 'sudo apt update', run_in_background: false };
    const payload = {
      toolName: 'run_shell_command',
      args: callerArgs,
    };

    const promise = handlers['execute-tool'](null, payload);

    expect(payload.args).toEqual({ command: 'sudo apt update', run_in_background: false });
    expect(callerArgs).toEqual({ command: 'sudo apt update', run_in_background: false });
    expectLastRequestWith('execute_tool', {
      tool_name: 'run_shell_command',
      args: {
        command: 'sudo apt update',
        run_in_background: false,
        sudo_auth_mode: 'native',
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { value: 1 } });
    await expect(promise).resolves.toEqual({ success: true, data: { value: 1 } });
  });

  test('execute-tool forwards direct tool args unchanged', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const args = {
      action: 'click',
      find_coordinates_by: 'ocr',
      ocr_text: 'Submit',
    };

    const promise = handlers['execute-tool'](null, {
      toolName: 'mouse_control',
      args,
    });

    expectLastRequestWith('execute_tool', {
      tool_name: 'mouse_control',
      args,
    });

    emitRpcResult(stdoutHandler, { success: true, data: { ok: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { ok: true } });
  });

  test('passes resolved backend http URL to Python sidecar env', () => {
    process.env.BACKEND_HOST = '192.168.1.55';
    process.env.BACKEND_PORT = '8811';
    const { spawn } = initBridge();
    markReady();

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          WINDIE_BACKEND_HTTP_URL: 'http://192.168.1.55:8811',
        }),
      }),
    );
  });

  test('passes hosted-first backend URLs to Python sidecar env for customer-mode desktop runs', () => {
    const { spawn } = initBridge();
    markReady();

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          WINDIE_BACKEND_HTTP_URL: 'https://api.windieos.com',
        }),
      }),
    );
  });

  test('passes packaged hosted backend default URL to Python sidecar env', () => {
    const { spawn } = initBridge({ isPackaged: true });
    markReady();

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          WINDIE_BACKEND_HTTP_URL: 'https://api.windieos.com',
        }),
      }),
    );
  });

  test('adds --no-deprecation to Node options for local backend subprocesses', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096';
    const { spawn } = initBridge();
    markReady();

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          NODE_OPTIONS: '--max-old-space-size=4096 --no-deprecation',
        }),
      }),
    );
  });

  test('suppresses known deprecation and INFO stderr lines by default', () => {
    const { stderrHandler } = initBridge();
    markReady();

    stderrHandler()(
      Buffer.from(
        [
          '(node:71611) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized',
          '(Use `node --trace-deprecation ...` to show where the warning was created)',
          '2026-02-16 16:24:39,551 - tools.browser.controller - INFO - Connected to Chrome: chrome://new-tab-page/',
          '2026-02-16 16:24:39,552 - local_backend - WARNING - Slow request',
        ].join('\n'),
      ),
    );

    const loggedLines = console.log.mock.calls.map((call) => call[0]);
    expect(
      loggedLines.some((line) => line.includes('[DEP0169] DeprecationWarning')),
    ).toBe(false);
    expect(
      loggedLines.some((line) => line.includes('trace-deprecation')),
    ).toBe(false);
    expect(
      loggedLines.some((line) => line.includes('Connected to Chrome')),
    ).toBe(false);
    expect(
      loggedLines.some((line) => line.includes('Slow request')),
    ).toBe(true);
  });

  test('forwards INFO stderr lines when verbose sidecar stderr flag is enabled', () => {
    process.env.WINDIE_VERBOSE_SIDECAR_STDERR = '1';
    const { stderrHandler } = initBridge();
    markReady();

    stderrHandler()(
      Buffer.from(
        '2026-02-16 16:24:39,551 - tools.browser.controller - INFO - Connected to Chrome: chrome://new-tab-page/\n',
      ),
    );

    const loggedLines = console.log.mock.calls.map((call) => call[0]);
    expect(
      loggedLines.some((line) => line.includes('Connected to Chrome')),
    ).toBe(true);
  });

  test('execute-tool handler returns error on json-rpc error', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['execute-tool'](null, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    emitRpcError(stdoutHandler, 'bad');

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'bad' });
  });

  test('get-system-state handler returns null on error response', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['get-system-state'](null, { fields: ['active_window'] });
    emitRpcResult(stdoutHandler, { success: false, error: 'fail' });

    const result = await promise;
    expect(result).toBeNull();
  });

  test('search-memory handler returns error on json-rpc error', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['search-memory'](null, {
      query: 'q',
      user_id: 'u',
      limit: 3,
      memory_type: 'semantic',
      excludeConversationId: 'conv-active',
      episodicLimit: 4,
      semanticLimit: 2,
      semanticMinScore: 0.2,
    });
    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'search_memory',
        params: {
          query: 'q',
          user_id: 'u',
          limit: 3,
          memory_type: 'semantic',
          exclude_conversation_id: 'conv-active',
          episodic_limit: 4,
          semantic_limit: 2,
          semantic_min_score: 0.2,
        },
      }),
    );

    emitRpcError(stdoutHandler, 'nope');

    const result = await promise;
    expect(result).toEqual({ success: false, error: 'nope' });
  });

  test('search-memory handler accepts snake_case exclude_conversation_id payload key', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['search-memory'](null, {
      query: 'q2',
      user_id: 'u2',
      limit: 4,
      memory_type: 'episodic',
      exclude_conversation_id: 'conv-snake',
      episodic_limit: 3,
      semantic_limit: 1,
      semantic_min_score: 0.15,
    });
    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'search_memory',
        params: {
          query: 'q2',
          user_id: 'u2',
          limit: 4,
          memory_type: 'episodic',
          exclude_conversation_id: 'conv-snake',
          episodic_limit: 3,
          semantic_limit: 1,
          semantic_min_score: 0.15,
        },
      }),
    );

    emitRpcResult(stdoutHandler, { success: true, data: { memories: [] } });

    const result = await promise;
    expect(result).toEqual({ success: true, data: { memories: [] } });
  });

  test('list-conversations handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-conversations'](null, {
      userId: 'u-1',
      limit: 7,
      recordKind: 'transcript',
    });

    expectLastRequestWith('list_conversations', {
      user_id: 'u-1',
      limit: 7,
      record_kind: 'transcript',
    });

    await expectResolvedSuccess(stdoutHandler, promise, { items: [] });
  });

  test('search-conversations handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['search-conversations'](null, {
      userId: 'u-1',
      query: 'ubuntu mic',
      limit: 9,
    });

    expectLastRequestWith('search_conversations', {
      user_id: 'u-1',
      query: 'ubuntu mic',
      limit: 9,
    });

    await expectResolvedSuccess(stdoutHandler, promise, { conversations: [] });
  });

  test('list-conversations handler safely handles non-object payloads', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-conversations'](null, 'invalid-payload');

    expectLastRequestWith('list_conversations', {});

    await expectResolvedSuccess(stdoutHandler, promise, { items: [] });
  });

  test('list-semantic-memories handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-semantic-memories'](null, {
      userId: 'u-1',
      limit: 12,
    });

    expectLastRequestWith('list_semantic_memories', {
      user_id: 'u-1',
      limit: 12,
    });

    await expectResolvedSuccess(stdoutHandler, promise, { memories: [] });
  });

  test('list-episodic-memories handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-episodic-memories'](null, {
      userId: 'u-episodic',
      limit: 25,
    });

    expectLastRequestWith('list_episodic_memories', {
      user_id: 'u-episodic',
      limit: 25,
    });

    await expectResolvedSuccess(stdoutHandler, promise, { memories: [] });
  });

  test('get-conversation handler maps missing conversationId to null', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['get-conversation'](null, {
      userId: 'u-1',
      limit: 4,
      recordKind: 'transcript',
    });

    expectLastRequestWith('get_conversation', {
      user_id: 'u-1',
      conversation_id: null,
      limit: 4,
      record_kind: 'transcript',
      after_message_index: undefined,
    });

    await expectResolvedSuccess(stdoutHandler, promise, { messages: [] });
  });

  test('get-conversation handler maps afterMessageIndex cursor', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['get-conversation'](null, {
      userId: 'u-1',
      conversationId: 'conv-1',
      limit: 100,
      recordKind: 'transcript',
      afterMessageIndex: 500,
    });

    expectLastRequestWith('get_conversation', {
      user_id: 'u-1',
      conversation_id: 'conv-1',
      limit: 100,
      record_kind: 'transcript',
      after_message_index: 500,
    });

    await expectResolvedSuccess(stdoutHandler, promise, { messages: [] });
  });

  test('delete-conversation handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['delete-conversation'](null, {
      userId: 'u-1',
      conversationId: 'c-1',
      recordKind: 'transcript',
    });

    expectLastRequestWith('delete_conversation', {
      user_id: 'u-1',
      conversation_id: 'c-1',
      record_kind: 'transcript',
    });

    await expectResolvedSuccess(stdoutHandler, promise, { deleted_count: 3 });
  });

  test('delete-semantic-memory handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['delete-semantic-memory'](null, {
      userId: 'u-1',
      memoryId: 'm-1',
    });

    expectLastRequestWith('delete_semantic_memory', {
      user_id: 'u-1',
      memory_id: 'm-1',
    });

    await expectResolvedSuccess(stdoutHandler, promise, { deleted: true });
  });

  test('delete-episodic-memory handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['delete-episodic-memory'](null, {
      userId: 'u-1',
      memoryId: 'ep-1',
    });

    expectLastRequestWith('delete_episodic_memory', {
      user_id: 'u-1',
      memory_id: 'ep-1',
    });

    await expectResolvedSuccess(stdoutHandler, promise, { deleted: true });
  });

  test('clear-local-memory handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['clear-local-memory'](null, {
      userId: 'u-memory',
    });

    expectLastRequestWith('clear_local_memory', {
      user_id: 'u-memory',
    });

    await expectResolvedSuccess(stdoutHandler, promise, {
      episodic_deleted_count: 2,
      semantic_deleted_count: 3,
    });
  });

  test('clear-chat-history handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['clear-chat-history'](null, {
      userId: 'u-chats',
    });

    expectLastRequestWith('clear_chat_history', {
      user_id: 'u-chats',
    });

    await expectResolvedSuccess(stdoutHandler, promise, {
      deleted_count: 4,
      deleted_title_count: 1,
    });
  });

  test('store-transcript handler returns standardized error payload', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-transcript'](null, {
      content: 'hello',
      userId: 'u-1',
      conversationRef: 'conv-1',
      role: 'assistant',
      transparency: {
        systemPrompt: 'prompt',
      },
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'store_transcript',
        params: expect.objectContaining({
          user_id: 'u-1',
          conversation_ref: 'conv-1',
          role: 'assistant',
          transparency: {
            systemPrompt: 'prompt',
          },
        }),
      }),
    );

    emitRpcError(stdoutHandler, 'store failed');

    await expect(promise).resolves.toEqual({ success: false, error: 'store failed' });
  });

  test('store-transcript handler sanitizes surrogate and mojibake payload text', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-transcript'](null, {
      content: 'bad\udc9dcontent',
      userId: 'u-1',
      conversationRef: 'conv-1',
      role: 'assistant',
      transparency: {
        systemPrompt: 'Active: â€œWindieOS â€” READMEâ€\u009d',
      },
    });

    expectLastRequestWith('store_transcript', {
      content: 'bad�content',
      user_id: 'u-1',
      conversation_ref: 'conv-1',
      role: 'assistant',
      message_type: undefined,
      tool_name: undefined,
      correlation_id: undefined,
      message_index: undefined,
      model_id: undefined,
      model_provider: undefined,
      screenshot: undefined,
      timestamp: undefined,
      transparency: {
        systemPrompt: 'Active: “WindieOS — README”',
      },
    });

    await expectResolvedSuccess(stdoutHandler, promise, { ok: true });
  });

  test('store-transcript handler preserves emoji while replacing lone surrogate payload text', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-transcript'](null, {
      content: 'Hey 👋\udc9d',
      userId: 'u-1',
      conversationRef: 'conv-1',
      role: 'assistant',
      transparency: {
        systemPrompt: 'Wave 👋 then lone \udc9d',
      },
    });

    expectLastRequestWith('store_transcript', expect.objectContaining({
      content: 'Hey 👋\uFFFD',
      user_id: 'u-1',
      conversation_ref: 'conv-1',
      role: 'assistant',
      transparency: {
        systemPrompt: 'Wave 👋 then lone \uFFFD',
      },
    }));

    await expectResolvedSuccess(stdoutHandler, promise, { ok: true });
  });

  test('store-transcript handler maps replay-state payload fields', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-transcript'](null, {
      content: '[internal replay entry]',
      userId: 'u-1',
      conversationRef: 'conv-1',
      role: 'assistant',
      messageType: 'context-compaction',
      messageIndex: 12,
      recordKind: 'transcript_replay',
      rehydrateEntry: {
        role: 'assistant',
        content: '[[CONTEXT COMPACTION SUMMARY]]\nsummary',
        message_type: 'context_compaction',
      },
    });

    expectLastRequestWith('store_transcript', expect.objectContaining({
      content: '[internal replay entry]',
      user_id: 'u-1',
      conversation_ref: 'conv-1',
      role: 'assistant',
      message_type: 'context-compaction',
      message_index: 12,
      record_kind: 'transcript_replay',
      rehydrate_entry: {
        role: 'assistant',
        content: '[[CONTEXT COMPACTION SUMMARY]]\nsummary',
        message_type: 'context_compaction',
      },
    }));

    await expectResolvedSuccess(stdoutHandler, promise, { ok: true });
  });

  test('store-memory handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-memory'](null, {
      userQuery: 'What is WindieOS?',
      assistantResponse: 'A desktop assistant.',
      memoryType: 'semantic',
      userId: 'u-1',
      sessionId: 'session-7',
    });

    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method: 'store_memory',
        params: {
          user_query: 'What is WindieOS?',
          assistant_response: 'A desktop assistant.',
          memory_type: 'semantic',
          user_id: 'u-1',
          session_id: 'session-7',
        },
      }),
    );

    await expectResolvedSuccess(stdoutHandler, promise, { stored: true });
  });

  test('store-memory handler sanitizes surrogate and mojibake payload text', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-memory'](null, {
      userQuery: 'What\udc9d',
      assistantResponse: 'Active: â€œWindieOS â€” READMEâ€\u009d',
      memoryType: 'semantic',
      userId: 'u-1',
      sessionId: 'session-7',
    });

    expectLastRequestWith('store_memory', {
      user_query: 'What�',
      assistant_response: 'Active: “WindieOS — README”',
      memory_type: 'semantic',
      user_id: 'u-1',
      session_id: 'session-7',
    });

    await expectResolvedSuccess(stdoutHandler, promise, { stored: true });
  });

  test('store-memory handler preserves emoji while replacing lone surrogate payload text', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-memory'](null, {
      userQuery: 'What 👋\udc9d',
      assistantResponse: 'Reply 👋\udc9d',
      memoryType: 'semantic',
      userId: 'u-1',
      sessionId: 'session-7',
    });

    expectLastRequestWith('store_memory', expect.objectContaining({
      user_query: 'What 👋\uFFFD',
      assistant_response: 'Reply 👋\uFFFD',
      memory_type: 'semantic',
      user_id: 'u-1',
      session_id: 'session-7',
    }));

    await expectResolvedSuccess(stdoutHandler, promise, { stored: true });
  });
});
