/**
 * Covers app config provider. utils behavior in the frontend test suite.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';

import {
  IpcBridge,
} from '../../src/renderer/infrastructure/ipc/bridge';
import {
  INVOKE_CHANNELS,
  ON_CHANNELS,
  SEND_CHANNELS,
} from '../../src/renderer/infrastructure/ipc/channels';
import { AppConfigProvider } from '../../src/renderer/app/providers/AppConfigProvider';
import { useAppConfigContext } from '../../src/renderer/app/providers/AppConfigContext';
import {
  DesktopSettingsEventRuntimeClient,
} from '../../src/renderer/app/runtime/desktopSettingsEventRuntimeClient';
import {
  DesktopRendererConfigStorageRuntime,
} from '../../src/renderer/app/runtime/desktopRendererConfigStorageRuntime';
import { DesktopRuntimeEndpointClient } from '../../src/renderer/app/runtime/desktopRuntimeEndpointClient';
import { DesktopSettingsRuntimeClient } from '../../src/renderer/app/runtime/desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

jest.mock('../../src/renderer/app/runtime/desktopSettingsEventRuntimeClient');
jest.mock('../../src/renderer/app/runtime/desktopRendererConfigFilterRuntime', () => ({
  DesktopRendererConfigFilterRuntime: {
    filterRendererConfig: (config: Record<string, any>) => config,
  },
}));
jest.mock('../../src/renderer/app/runtime/desktopRendererConfigStorageRuntime', () => ({
  DesktopRendererConfigStorageRuntime: {
    getRendererConfigStorageKey: jest.fn(() => 'windieos-config'),
    isRendererConfigStorageEvent: jest.fn((event: StorageEvent, storageArea: Storage) => (
      event?.storageArea === storageArea
      && (!event?.key || event.key === 'windieos-config')
    )),
    loadConfigFromStorage: jest.fn(),
    saveConfigToStorage: jest.fn(),
  },
}));
jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    bindTranscriptUser: jest.fn(),
    updateTranscriptSession: jest.fn(),
  },
}));
jest.mock('../../src/renderer/app/runtime/desktopRuntimeEndpointClient', () => ({
  DesktopRuntimeEndpointClient: {
    setHttpUrl: jest.fn(),
    syncFromConnectionSnapshot: jest.fn(),
  },
}));
jest.mock('../../src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    listModels: jest.fn(),
    requestDashboardStartupModelList: jest.fn(),
    updateSettings: jest.fn(),
  },
}));

export const listeners = new Map<string, (data: any) => void>();

let removeIpcListener: jest.Mock;
let loadDesktopUiConfigResponse: any = null;
let clientUserIdResponse: any = null;

export const mockUseDesktopSettingsEventHandlers = (
  DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers as jest.Mock
);
export const mockRouteDesktopSettingsEvent = (
  DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent as jest.Mock
);
export const mockGetRendererConfigStorageKey = (
  DesktopRendererConfigStorageRuntime.getRendererConfigStorageKey as jest.Mock
);
export const mockIsRendererConfigStorageEvent = (
  DesktopRendererConfigStorageRuntime.isRendererConfigStorageEvent as jest.Mock
);
export const mockLoadConfigFromStorage = (
  DesktopRendererConfigStorageRuntime.loadConfigFromStorage as jest.Mock
);
export const mockSaveConfigToStorage = (
  DesktopRendererConfigStorageRuntime.saveConfigToStorage as jest.Mock
);
export const mockBindTranscriptUser = DesktopTranscriptSessionRuntimeClient.bindTranscriptUser as jest.Mock;
export const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock;
export const mockSetRuntimeEndpointHttpUrl = DesktopRuntimeEndpointClient.setHttpUrl as jest.Mock;
export const mockSyncRuntimeEndpointFromSnapshot = DesktopRuntimeEndpointClient.syncFromConnectionSnapshot as jest.Mock;
export const mockDesktopSettingsListModels = DesktopSettingsRuntimeClient.listModels as jest.Mock;
export const mockDesktopSettingsRequestStartupModels = DesktopSettingsRuntimeClient.requestDashboardStartupModelList as jest.Mock;
export const mockDesktopSettingsUpdateSettings = DesktopSettingsRuntimeClient.updateSettings as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppConfigProvider>{children}</AppConfigProvider>
);

export function renderAppConfigContext() {
  return renderHook(() => useAppConfigContext(), { wrapper });
}

export function setLoadDesktopUiConfigResponse(response: any) {
  loadDesktopUiConfigResponse = response;
}

export function setClientUserIdResponse(response: any) {
  clientUserIdResponse = response;
}

export function getRemoveIpcListenerMock() {
  return removeIpcListener;
}

export function getIpcListener(channel: string) {
  return listeners.get(channel);
}

export async function flushAsyncEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

export function registerAppConfigProviderSuiteLifecycle() {
  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    window.history.pushState({}, '', '/');
    delete (window as Window & {
      __desktop_runtime_models_list_requested__?: boolean;
    }).__desktop_runtime_models_list_requested__;
    removeIpcListener = jest.fn();
    loadDesktopUiConfigResponse = null;
    clientUserIdResponse = null;

    mockLoadConfigFromStorage.mockReturnValue({ speech_mode_enabled: false });
    mockDesktopSettingsRequestStartupModels.mockReturnValue(true);
    mockUseDesktopSettingsEventHandlers.mockReturnValue({
      handleModelsListed: jest.fn(),
    });
    mockRouteDesktopSettingsEvent.mockImplementation((data, handlers) => {
      if (data?.type === 'models-listed') {
        handlers?.handleModelsListed(data);
      }
    });

    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel: any, handler: any) => {
      listeners.set(channel, handler);
      return removeIpcListener;
    });
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any) => {
      if (channel === INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG) {
        return loadDesktopUiConfigResponse;
      }
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return clientUserIdResponse;
      }
      return null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
}

export {
  act,
  DesktopSettingsRuntimeClient,
  INVOKE_CHANNELS,
  IpcBridge,
  ON_CHANNELS,
  SEND_CHANNELS,
};
