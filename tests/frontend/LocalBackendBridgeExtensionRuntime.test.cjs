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

const {
  createLocalBackendExecuteToolRuntime,
} = require('../../frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs');

describe('local backend bridge extension runtime', () => {
  test('executes main-process extension tools and applies tool lifecycle hooks', async () => {
    const sendRequest = jest.fn();
    const runExtensionHook = jest.fn(async (hookName, payload) => {
      if (hookName === 'beforeToolCall') {
        return [{
          extension_id: 'notes',
          result: {
            args: {
              ...payload.args,
              note: `${payload.args.note}!`,
            },
          },
        }];
      }
      if (hookName === 'afterToolCall') {
        return [{
          extension_id: 'notes',
          result: {
            result: {
              ...payload.result,
              data: {
                ...payload.result.data,
                after_hook: true,
              },
            },
          },
        }];
      }
      return [];
    });
    const executeExtensionTool = jest.fn(async (toolName, args) => ({
      success: true,
      data: {
        llm_content: `${toolName}:${args.note}`,
      },
    }));

    const runtime = createLocalBackendExecuteToolRuntime({
      sendRequest,
      backendHttpUrl: 'http://127.0.0.1:8765',
      getArtifactUploadHeaders: async () => ({}),
      getFrontendConfig: () => ({}),
      resolveWindows: () => [],
      resolveChatWindow: () => null,
      resolveMainWindow: () => null,
      resolveResponseWindow: () => null,
      executeExtensionTool,
      runExtensionHook,
    });

    const result = await runtime.executeTool(null, {
      toolName: 'summarize_note',
      args: { note: 'hello' },
    });

    expect(sendRequest).not.toHaveBeenCalled();
    expect(executeExtensionTool).toHaveBeenCalledWith(
      'summarize_note',
      { note: 'hello!' },
      { senderWindowId: null },
    );
    expect(result).toEqual({
      success: true,
      data: {
        llm_content: 'summarize_note:hello!',
        after_hook: true,
      },
    });
  });
});
