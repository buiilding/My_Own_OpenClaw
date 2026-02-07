import { act, renderHook } from '@testing-library/react';

import { IpcBridge, ON_CHANNELS, SEND_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useToolRunner } from '../../frontend/src/renderer/features/chat/hooks/useToolRunner';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { recordToolMessage } from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';

const mockExecuteTool = jest.fn().mockResolvedValue(undefined);
const mockExecuteToolBundle = jest.fn().mockResolvedValue(undefined);
let mockCapturedServiceCallbacks: any = null;

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: {
      selected_model_id: 'test-model',
      model_provider: 'test-provider',
    },
  }),
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  recordToolMessage: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ToolExecutionService', () => ({
  ToolExecutionService: jest.fn().mockImplementation((callbacks) => {
    mockCapturedServiceCallbacks = callbacks;
    return {
      executeTool: mockExecuteTool,
      executeToolBundle: mockExecuteToolBundle,
    };
  }),
}));

describe('useToolRunner', () => {
  let backendHandler: ((data: unknown) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedServiceCallbacks = null;
    backendHandler = null;
    mockExecuteTool.mockResolvedValue(undefined);
    mockExecuteToolBundle.mockResolvedValue(undefined);

    useChatStore.setState({
      messages: [],
      isSending: false,
      thinkingStatus: null,
      tokenCounts: null,
    });

    (global as any).crypto = {
      randomUUID: jest.fn(() => 'generated-id'),
    };

    jest.spyOn(IpcBridge, 'on').mockImplementation((channel: any, handler: any) => {
      if (channel === ON_CHANNELS.FROM_BACKEND) {
        backendHandler = handler;
      }
      return () => undefined;
    });
    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('subscribes to backend events when enabled', () => {
    renderHook(() => useToolRunner(true));

    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.FROM_BACKEND,
      expect.any(Function),
    );
    expect(backendHandler).toBeTruthy();
  });

  test('does not subscribe when disabled', () => {
    renderHook(() => useToolRunner(false));

    expect(IpcBridge.on).not.toHaveBeenCalled();
  });

  test('dispatches tool-call events to ToolExecutionService', async () => {
    renderHook(() => useToolRunner(true));

    await act(async () => {
      backendHandler?.({
        type: 'tool-call',
        id: 'event-id',
        payload: {
          tool_name: 'read_file',
          parameters: { file_path: '/tmp/a' },
          correlation_id: 'corr-1',
        },
      });
    });

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'read_file',
      { file_path: '/tmp/a' },
      { correlationId: 'corr-1', skipAutoCapture: false },
    );
  });

  test('dispatches tool-bundle events with mapped tools', async () => {
    renderHook(() => useToolRunner(true));

    await act(async () => {
      backendHandler?.({
        type: 'tool-bundle',
        payload: {
          bundle_id: 'bundle-abc',
          tools: [
            { name: 'read_file', args: { file_path: '/tmp/a' } },
            { name: 'write_file', args: { file_path: '/tmp/b', content: 'x' } },
            { name: '', args: {} },
          ],
        },
      });
    });

    expect(mockExecuteToolBundle).toHaveBeenCalledWith(
      [
        { toolName: 'read_file', args: { file_path: '/tmp/a' } },
        { toolName: 'write_file', args: { file_path: '/tmp/b', content: 'x' } },
      ],
      'bundle-abc',
    );
  });

  test('wires service callbacks to chat store and backend sender', () => {
    renderHook(() => useToolRunner(true));

    expect(mockCapturedServiceCallbacks).toBeTruthy();

    mockCapturedServiceCallbacks.sendToBackend({ type: 'tool-result', payload: { ok: true } });
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      { type: 'tool-result', payload: { ok: true } },
    );

    mockCapturedServiceCallbacks.onToolResult({
      toolName: 'read_file',
      result: { success: true, data: { metadata: { request_id: 'corr-2' } }, error: null },
      executionTime: 0.1,
      correlationId: 'corr-2',
      formattedMessage: 'formatted output',
      screenshotRef: 'artifact-1',
      screenshotUrl: '/api/artifacts/artifact-1',
    });

    const lastMessage = useChatStore.getState().messages.at(-1);
    expect(lastMessage).toEqual(
      expect.objectContaining({
        type: 'tool-output',
        text: 'formatted output',
        toolName: 'read_file',
        correlationId: 'corr-2',
        screenshotRef: 'artifact-1',
      }),
    );
    expect(recordToolMessage).toHaveBeenCalledWith(
      'formatted output',
      expect.objectContaining({
        messageType: 'tool-output',
        toolName: 'read_file',
        correlationId: 'corr-2',
      }),
    );
  });
});
