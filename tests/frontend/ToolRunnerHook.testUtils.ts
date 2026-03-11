import { act, renderHook } from '@testing-library/react';

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useToolRunner } from '../../frontend/src/renderer/features/chat/hooks/useToolRunner';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { recordToolMessage } from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import {
  createDefaultTestAppConfig,
  setMockAppConfigContextValue,
  type TestAppConfig,
} from './appConfigTestUtils';
import { resetChatStoreForTests } from './chatStoreTestUtils';

export const mockExecuteTool = jest.fn().mockResolvedValue(undefined);
export const mockExecuteToolBundle = jest.fn().mockResolvedValue(undefined);
let mockCapturedServiceCallbacks: any = null;
let mockConfig: TestAppConfig = createDefaultTestAppConfig();
const mockUseToolRunnerAppConfigContext = jest.fn(() => ({ config: mockConfig }));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockUseToolRunnerAppConfigContext(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  recordToolMessage: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionService', () => ({
  ToolExecutionService: jest.fn().mockImplementation((callbacks) => {
    mockCapturedServiceCallbacks = callbacks;
    return {
      executeTool: mockExecuteTool,
      executeToolBundle: mockExecuteToolBundle,
    };
  }),
}));

let backendHandler: ((data: unknown) => void) | null = null;
let removeListener: jest.Mock;

export function createStreamTracking(overrides: Record<string, unknown> = {}) {
  return {
    ...useChatStore.getState().streamTracking,
    ...overrides,
  };
}

export function setStreamTracking(overrides: Record<string, unknown>) {
  useChatStore.setState({
    streamTracking: createStreamTracking(overrides),
  });
}

export function setMockConfig(nextConfig: TestAppConfig) {
  mockConfig = nextConfig;
  setMockAppConfigContextValue(mockUseToolRunnerAppConfigContext, mockConfig);
}

export function getCapturedServiceCallbacks() {
  return mockCapturedServiceCallbacks;
}

export function getRemoveListenerMock() {
  return removeListener;
}

export function getToolExecutionServiceMock() {
  return jest.requireMock(
    '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionService',
  ).ToolExecutionService as jest.Mock;
}

export function renderToolRunner(enabled = true) {
  return renderHook(() => useToolRunner(enabled));
}

export function renderToolRunnerWithProps(initialEnabled = true) {
  return renderHook(
    ({ enabled }) => useToolRunner(enabled),
    { initialProps: { enabled: initialEnabled } },
  );
}

export function emitBackendEvent(data: unknown) {
  backendHandler?.(data);
}

export async function emitBackendEventAsync(data: unknown) {
  await act(async () => {
    backendHandler?.(data);
  });
}

export function resetToolRunnerTestState() {
  jest.clearAllMocks();
  mockCapturedServiceCallbacks = null;
  backendHandler = null;
  setMockConfig(createDefaultTestAppConfig());
  mockExecuteTool.mockResolvedValue(undefined);
  mockExecuteToolBundle.mockResolvedValue(undefined);
  removeListener = jest.fn();

  resetChatStoreForTests(null);

  (global as any).crypto = {
    randomUUID: jest.fn(() => 'generated-id'),
  };
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) jsdom',
    configurable: true,
  });

  jest.spyOn(IpcBridge, 'on').mockImplementation((channel: any, handler: any) => {
    if (channel === ON_CHANNELS.FROM_BACKEND) {
      backendHandler = handler;
    }
    return removeListener;
  });
  jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
  jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any, data?: any) => {
    if (channel === INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY) {
      return { success: true, data: { visible: false } };
    }
    if (
      channel === INVOKE_CHANNELS.SHOW_CHATBOX
      || channel === INVOKE_CHANNELS.HIDE_CHATBOX
      || channel === INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT
    ) {
      return { success: true };
    }
    if (channel === INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT) {
      return {
        success: true,
        waitMs: data?.waitMs ?? 0,
        settleMs: data?.settleMs ?? 120,
        waitTime: typeof data?.waitMs === 'number' ? data.waitMs / 1000 : 0,
        hideInvokeTime: 0.001,
        settleTime: typeof data?.settleMs === 'number' ? data.settleMs / 1000 : 0.12,
        hiddenSurface: 'chatbox',
      };
    }
    return {};
  });
}

export function restoreToolRunnerMocks() {
  jest.restoreAllMocks();
}

export {
  IpcBridge,
  INVOKE_CHANNELS,
  ON_CHANNELS,
  SEND_CHANNELS,
  useChatStore,
  recordToolMessage,
};
