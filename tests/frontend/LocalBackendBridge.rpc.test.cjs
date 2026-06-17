/** @jest-environment node */

const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  createWindow,
  getAppendDiagnosticEventMock,
  getLastWrittenRequest,
  initBridge,
  markReady,
  rejectNextSdkRuntimeRequest,
  resolveNextSdkRuntimeRequest,
  registerBridgeSuiteLifecycleHooks,
} = require('./__mocks__/localBackendBridgeHarness.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

function createOwnedScreenshotTempPath(label, dirName = 'desktop-agent-screenshots') {
  return path.join(
    os.tmpdir(),
    dirName,
    `windie-shot-${Date.now()}-${label}.jpg`,
  );
}

describe('local_backend_bridge RPC handlers', () => {
  registerBridgeSuiteLifecycleHooks();

  function emitRpcResult(_stdoutHandler, result) {
    resolveNextSdkRuntimeRequest(result);
  }

  function emitRpcError(_stdoutHandler, message) {
    rejectNextSdkRuntimeRequest(new Error(message));
  }

  async function expectResolvedSuccess(stdoutHandler, promise, data) {
    emitRpcResult(stdoutHandler, { success: true, data });
    await expect(promise).resolves.toEqual({ success: true, data });
  }

  async function expectLastRequestWith(method, params) {
    await Promise.resolve();
    await Promise.resolve();
    const request = getLastWrittenRequest();
    expect(request).toEqual(
      expect.objectContaining({
        method,
        params,
      }),
    );
  }

  test('does not register generic renderer execute-tool IPC handler', () => {
    const { handlers } = initBridge();

    expect(handlers['execute-tool']).toBeUndefined();
  });

  test('emits local-runtime readiness in lifecycle diagnostics', () => {
    const appendDiagnosticEvent = getAppendDiagnosticEventMock();

    initBridge();

    expect(appendDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      path: 'local_backend.lifecycle',
      data: expect.objectContaining({
        ready: false,
        localRuntimeReady: false,
      }),
    }));
  });

  test('internal tool execution returns success for valid response', async () => {
    const { bridge, stdoutHandler } = initBridge();
    markReady();

    const promise = bridge.executeToolForBackend({
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { value: 1 } });

    const result = await promise;
    expect(result).toEqual({ success: true, data: { value: 1 } });
  });

  test('named renderer host channels map to scoped local tools', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const readPromise = handlers['read-attachment-file'](null, {
      filePath: '/tmp/a',
    });
    await expectLastRequestWith('execute_tool', {
      tool_name: 'read_file',
      args: { file_path: '/tmp/a' },
    });
    await expectResolvedSuccess(stdoutHandler, readPromise, { content: 'body' });

    const browserPromise = handlers['run-browser-action'](null, {
      action: 'switch',
      tab_index: 2,
      activate: false,
    });
    await expectLastRequestWith('execute_tool', {
      tool_name: 'browser',
      args: {
        action: 'switch',
        explanation: 'Manage the dedicated browser session from the chat header.',
        tab_index: 2,
        activate: false,
      },
    });
    await expectResolvedSuccess(stdoutHandler, browserPromise, { tab_index: 2 });

    const screenshotPromise = handlers['capture-screenshot-attachment'](null, {
      args: { explanation: 'Attach current screen' },
    });
    await expectLastRequestWith('execute_tool', {
      tool_name: 'screenshot',
      args: expect.objectContaining({
        explanation: 'Attach current screen',
      }),
    });
    await expectResolvedSuccess(stdoutHandler, screenshotPromise, { screenshot: 'shot' });
  });

  test('internal tool execution routes through the SDK local tool executor', async () => {
    const sdkLocalToolExecutor = {
      executeTool: jest.fn(async () => ({ success: true, data: { value: 2 } })),
    };
    const { bridge, spawn } = initBridge({ sdkLocalToolExecutor });
    markReady();

    const result = await bridge.executeToolForBackend({
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
    });

    expect(result).toEqual({ success: true, data: { value: 2 } });
    expect(sdkLocalToolExecutor.executeTool).toHaveBeenCalledWith({
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
      timeoutMs: 60000,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('browser warmup sends a valid connect payload with explanation', async () => {
    const { bridge, stdoutHandler } = initBridge({ mainHostSkin });
    markReady();

    const promise = bridge.warmBrowserAutomation();

    await expectLastRequestWith('execute_tool', {
      tool_name: 'browser',
      args: {
        action: 'connect',
        explanation: 'Open the WindieOS browser for onboarding and profile setup.',
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { connected: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { success: true, data: { connected: true } } });
  });

  test('internal tool execution handles large JSON-RPC stdout lines', async () => {
    const { bridge, stdoutHandler } = initBridge();
    markReady();

    const largePayload = 'x'.repeat(140 * 1024);
    const promise = bridge.executeToolForBackend({
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

  test('screenshot host channel uploads temp-path responses and returns artifact refs', async () => {
    const { handlers, stdoutHandler } = initBridge({
      getArtifactUploadHeaders: async () => ({
        Authorization: 'Bearer test-install-token',
      }),
    });
    markReady();

    const screenshotPath = createOwnedScreenshotTempPath('capture');
    await fsPromises.mkdir(path.dirname(screenshotPath), { recursive: true, mode: 0o700 });
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
      const promise = handlers['capture-screenshot-attachment'](null, {
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
      await fsPromises.rm(screenshotPath, { force: true });
    }
  });

  test('screenshot host channel accepts legacy owned temp directory', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const screenshotPath = createOwnedScreenshotTempPath('legacy-capture', 'windieos-screenshots');
    await fsPromises.mkdir(path.dirname(screenshotPath), { recursive: true, mode: 0o700 });
    await fsPromises.writeFile(screenshotPath, Buffer.from('legacy-fake-jpeg-bytes'));

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        artifact_id: 'legacy-artifact-1',
      }),
    });

    try {
      const promise = handlers['capture-screenshot-attachment'](null, {
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
          screenshot_content_type: 'image/jpeg',
          screenshot_ref: 'legacy-artifact-1',
          screenshot_url: 'https://api.windieos.com/api/artifacts/legacy-artifact-1',
        },
      });
      await expect(fsPromises.access(screenshotPath)).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
      await fsPromises.rm(screenshotPath, { force: true });
    }
  });

  test('screenshot host channel rejects unowned temp paths without reading or deleting', async () => {
    const { handlers, stdoutHandler } = initBridge({
      getArtifactUploadHeaders: async () => ({
        Authorization: 'Bearer test-install-token',
      }),
    });
    markReady();

    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-unowned-shot-'));
    const screenshotPath = path.join(tempDir, 'capture.jpg');
    await fsPromises.writeFile(screenshotPath, Buffer.from('do-not-read-or-delete'));

    const originalFetch = global.fetch;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    try {
      const promise = handlers['capture-screenshot-attachment'](null, {
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
          screenshot_content_type: 'image/jpeg',
        },
      });

      expect(fetchMock).not.toHaveBeenCalled();
      await expect(fsPromises.readFile(screenshotPath, 'utf8')).resolves.toBe('do-not-read-or-delete');
    } finally {
      global.fetch = originalFetch;
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('screenshot host channel injects active display affinity when sender window is hidden', async () => {
    const { handlers, stdoutHandler, mainWindow } = initBridge();
    markReady();

    mainWindow.isVisible.mockReturnValue(false);
    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/surfaces/display_affinity_runtime.cjs');
    setActiveDisplayAffinity({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });

    const promise = handlers['capture-screenshot-attachment']({ sender: {} }, {
      args: { explanation: 'Current monitor' },
    });

    await expectLastRequestWith('execute_tool', {
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

  test('screenshot host channel prefers visible chat window display bounds over stale active affinity', async () => {
    const chatWindow = createWindow({
      getBounds: jest.fn(() => ({ x: 1920, y: 0, width: 900, height: 600 })),
    });
    const { handlers, stdoutHandler, mainWindow } = initBridge({ chatWindow });
    markReady();

    mainWindow.isVisible.mockReturnValue(false);

    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/surfaces/display_affinity_runtime.cjs');
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

    const promise = handlers['capture-screenshot-attachment']({ sender: {} }, {
      args: { explanation: 'Current monitor' },
    });

    await expectLastRequestWith('execute_tool', {
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

  test('screenshot host channel injects visible chat window display bounds', async () => {
    const chatWindow = createWindow({
      getBounds: jest.fn(() => ({ x: 1920, y: 0, width: 900, height: 600 })),
    });
    const { handlers, stdoutHandler, mainWindow } = initBridge({ chatWindow });
    markReady();

    mainWindow.isVisible.mockReturnValue(false);

    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/surfaces/display_affinity_runtime.cjs');
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

    const promise = handlers['capture-screenshot-attachment']({ sender: {} }, {
      args: {
        explanation: 'Current monitor',
      },
    });

    await expectLastRequestWith('execute_tool', {
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

  test('screenshot host channel ignores visible response overlay when resolving monitor fallback', async () => {
    const responseWindow = createWindow({
      getBounds: jest.fn(() => ({ x: 1920, y: 0, width: 900, height: 600 })),
    });
    const { handlers, stdoutHandler, mainWindow } = initBridge({ responseWindow });
    markReady();

    mainWindow.isVisible.mockReturnValue(false);

    const {
      setActiveDisplayAffinity,
    } = require('../../frontend/src/main/surfaces/display_affinity_runtime.cjs');
    setActiveDisplayAffinity({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });

    const promise = handlers['capture-screenshot-attachment']({ sender: {} }, {
      args: { explanation: 'Current monitor' },
    });

    await expectLastRequestWith('execute_tool', {
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

  test('screenshot host channel falls back to inline screenshot when artifact upload fails', async () => {
    const { handlers, stdoutHandler } = initBridge({
      getArtifactUploadHeaders: async () => ({
        Authorization: 'Bearer test-install-token',
      }),
    });
    markReady();

    const screenshotPath = createOwnedScreenshotTempPath('inline');
    await fsPromises.mkdir(path.dirname(screenshotPath), { recursive: true, mode: 0o700 });
    await fsPromises.writeFile(screenshotPath, Buffer.from('fake-jpeg-inline'));

    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'artifact store offline',
    });
    global.fetch = fetchMock;

    try {
      const promise = handlers['capture-screenshot-attachment'](null, {
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
      await fsPromises.rm(screenshotPath, { force: true });
    }
  });

  test('internal tool execution forwards run_shell_command args unchanged', async () => {
    const { bridge, stdoutHandler } = initBridge();
    markReady();

    const callerArgs = { command: 'sudo apt update', run_in_background: false };
    const payload = {
      toolName: 'run_shell_command',
      args: callerArgs,
    };

    const promise = bridge.executeToolForBackend(payload);

    expect(payload.args).toEqual({ command: 'sudo apt update', run_in_background: false });
    expect(callerArgs).toEqual({ command: 'sudo apt update', run_in_background: false });
    await expectLastRequestWith('execute_tool', {
      tool_name: 'run_shell_command',
      args: {
        command: 'sudo apt update',
        run_in_background: false,
      },
    });

    emitRpcResult(stdoutHandler, { success: true, data: { value: 1 } });
    await expect(promise).resolves.toEqual({ success: true, data: { value: 1 } });
  });

  test('internal tool execution forwards direct tool args unchanged', async () => {
    const { bridge, stdoutHandler } = initBridge();
    markReady();

    const args = {
      action: 'click',
      find_coordinates_by: 'ocr',
      ocr_text: 'Submit',
    };

    const promise = bridge.executeToolForBackend({
      toolName: 'mouse_control',
      args,
    });

    await expectLastRequestWith('execute_tool', {
      tool_name: 'mouse_control',
      args,
    });

    emitRpcResult(stdoutHandler, { success: true, data: { ok: true } });
    await expect(promise).resolves.toEqual({ success: true, data: { ok: true } });
  });

  test('internal tool execution returns error on json-rpc error', async () => {
    const { bridge, stdoutHandler } = initBridge();
    markReady();

    const promise = bridge.executeToolForBackend({
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

  test('chat-event handlers map dedicated chat storage params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['store-chat-event'](null, {
      userId: 'u-1',
      conversationId: 'conv-1',
      eventType: 'compaction_applied',
      role: 'assistant',
      content: '[sdk event]',
      messageIndex: 12,
      revisionId: 'rev-1',
      eventPayload: {
        eventId: 'evt-1',
        type: 'compaction_applied',
      },
      attachments: [
        { kind: 'image', ref: 'artifact-1', contentType: 'image/png' },
      ],
      compactionCheckpoint: {
        entries: [{ role: 'assistant', content: 'summary' }],
      },
    });

    await expectLastRequestWith('store_chat_event', expect.objectContaining({
      user_id: 'u-1',
      conversation_id: 'conv-1',
      event_type: 'compaction_applied',
      role: 'assistant',
      content: '[sdk event]',
      message_index: 12,
      revision_id: 'rev-1',
      event_payload: {
        eventId: 'evt-1',
        type: 'compaction_applied',
      },
      attachments: [
        { kind: 'image', ref: 'artifact-1', contentType: 'image/png' },
      ],
      compaction_checkpoint: {
        entries: [{ role: 'assistant', content: 'summary' }],
      },
    }));

    await expectResolvedSuccess(stdoutHandler, promise, { ok: true });
  });

  test('replace-chat-conversation maps replacement events as one RPC payload', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['replace-chat-conversation'](null, {
      userId: 'u-1',
      conversationId: 'conv-1',
      revisionId: 'rev-next',
      revisionUpdatedAt: '2026-05-17T12:00:01+00:00',
      events: [
        {
          conversationId: 'conv-1',
          eventType: 'user_message',
          role: 'user',
          content: 'edited',
          messageIndex: 1,
          revisionId: 'rev-next',
          eventPayload: {
            eventId: 'evt-edited',
            type: 'user_message',
          },
        },
      ],
    });

    await expectLastRequestWith('replace_chat_conversation', {
      user_id: 'u-1',
      conversation_id: 'conv-1',
      revision_id: 'rev-next',
      revision_updated_at: '2026-05-17T12:00:01+00:00',
      events: [
        expect.objectContaining({
          conversation_id: 'conv-1',
          event_type: 'user_message',
          role: 'user',
          content: 'edited',
          message_index: 1,
          revision_id: 'rev-next',
          event_payload: {
            eventId: 'evt-edited',
            type: 'user_message',
          },
        }),
      ],
    });

    await expectResolvedSuccess(stdoutHandler, promise, { inserted_count: 1 });
  });

  test('rewrite-chat-conversation-after-event maps compact cutoff rewrite payload', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['rewrite-chat-conversation-after-event'](null, {
      userId: 'u-1',
      conversationId: 'conv-1',
      cutAfterEventId: 'evt-user',
      revisionId: 'rev-next',
      revisionUpdatedAt: '2026-05-17T12:00:01+00:00',
      event: {
        conversationId: 'conv-1',
        eventType: 'conversation_rewritten',
        role: 'assistant',
        content: '[sdk event: conversation_rewritten]',
        revisionId: 'rev-next',
        eventPayload: {
          eventId: 'evt-rewrite',
          type: 'conversation_rewritten',
        },
      },
    });

    await expectLastRequestWith('rewrite_chat_conversation_after_event', {
      user_id: 'u-1',
      conversation_id: 'conv-1',
      cut_after_event_id: 'evt-user',
      revision_id: 'rev-next',
      revision_updated_at: '2026-05-17T12:00:01+00:00',
      event: expect.objectContaining({
        conversation_id: 'conv-1',
        event_type: 'conversation_rewritten',
        role: 'assistant',
        content: '[sdk event: conversation_rewritten]',
        revision_id: 'rev-next',
        event_payload: {
          eventId: 'evt-rewrite',
          type: 'conversation_rewritten',
        },
      }),
    });

    await expectResolvedSuccess(stdoutHandler, promise, { inserted_count: 1 });
  });

  test('get-chat-conversation-revision maps to sidecar RPC', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['get-chat-conversation-revision'](null, {
      userId: 'u-1',
      conversationId: 'conv-1',
    });

    await expectLastRequestWith('get_chat_conversation_revision', {
      user_id: 'u-1',
      conversation_id: 'conv-1',
    });

    await expectResolvedSuccess(stdoutHandler, promise, {
      revision_id: 'rev-next',
    });
  });

  test('list-semantic-memories handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['list-semantic-memories'](null, {
      userId: 'u-1',
      limit: 12,
    });

    await expectLastRequestWith('list_semantic_memories', {
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

    await expectLastRequestWith('list_episodic_memories', {
      user_id: 'u-episodic',
      limit: 25,
    });

    await expectResolvedSuccess(stdoutHandler, promise, { memories: [] });
  });

  test('delete-semantic-memory handler maps payload keys to backend params', async () => {
    const { handlers, stdoutHandler } = initBridge();
    markReady();

    const promise = handlers['delete-semantic-memory'](null, {
      userId: 'u-1',
      memoryId: 'm-1',
    });

    await expectLastRequestWith('delete_semantic_memory', {
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

    await expectLastRequestWith('delete_episodic_memory', {
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

    await expectLastRequestWith('clear_local_memory', {
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

    await expectLastRequestWith('clear_chat_history', {
      user_id: 'u-chats',
    });

    await expectResolvedSuccess(stdoutHandler, promise, {
      deleted_count: 4,
      deleted_title_count: 1,
    });
  });

});
