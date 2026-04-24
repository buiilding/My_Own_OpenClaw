import React from 'react';
import { act, renderHook } from '@testing-library/react';

import {
  IpcBridge,
  INVOKE_CHANNELS,
  ON_CHANNELS,
  SEND_CHANNELS,
} from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { AppConfigProvider } from '../../frontend/src/renderer/app/providers/AppConfigProvider';
import { useAppConfigContext } from '../../frontend/src/renderer/app/providers/AppConfigContext';
import { useSettingsManagement } from '../../frontend/src/renderer/features/settings/hooks/useSettingsManagement';
import { loadConfigFromStorage, saveConfigToStorage } from '../../frontend/src/renderer/utils/configStorage';
import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { updateTranscriptSession } from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import { setBackendHttpUrl } from '../../frontend/src/renderer/infrastructure/services/BackendEndpointStore';

jest.mock('../../frontend/src/renderer/features/settings/hooks/useSettingsManagement');
jest.mock('../../frontend/src/renderer/utils/configFilter', () => ({
  filterFrontendConfig: (config: Record<string, any>) => config,
}));
jest.mock('../../frontend/src/renderer/utils/configStorage', () => ({
  loadConfigFromStorage: jest.fn(),
  saveConfigToStorage: jest.fn(),
}));
jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  updateTranscriptSession: jest.fn(),
}));
jest.mock('../../frontend/src/renderer/infrastructure/services/BackendEndpointStore', () => ({
  setBackendHttpUrl: jest.fn(),
}));
jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    updateSettings: jest.fn(),
  },
}));

export const listeners = new Map<string, (data: any) => void>();

let removeBackendListener: jest.Mock;
let loadFrontendConfigResponse: any = null;
let clientUserIdResponse: any = null;

export const mockUseSettingsManagement = useSettingsManagement as jest.Mock;
export const mockLoadConfigFromStorage = loadConfigFromStorage as jest.Mock;
export const mockSaveConfigToStorage = saveConfigToStorage as jest.Mock;
export const mockUpdateTranscriptSession = updateTranscriptSession as jest.Mock;
export const mockSetBackendHttpUrl = setBackendHttpUrl as jest.Mock;
export const mockApiClientUpdateSettings = ApiClient.updateSettings as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppConfigProvider>{children}</AppConfigProvider>
);

export function renderAppConfigContext() {
  return renderHook(() => useAppConfigContext(), { wrapper });
}

export function setLoadFrontendConfigResponse(response: any) {
  loadFrontendConfigResponse = response;
}

export function setClientUserIdResponse(response: any) {
  clientUserIdResponse = response;
}

export function getRemoveBackendListenerMock() {
  return removeBackendListener;
}

export function getBackendHandler(channel: string) {
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
    delete (window as Window & { __windie_models_list_requested__?: boolean }).__windie_models_list_requested__;
    removeBackendListener = jest.fn();
    loadFrontendConfigResponse = null;
    clientUserIdResponse = null;

    mockLoadConfigFromStorage.mockReturnValue({ speech_mode_enabled: false });
    mockUseSettingsManagement.mockReturnValue({
      handleModelsListed: jest.fn(),
    });

    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel: any, handler: any) => {
      listeners.set(channel, handler);
      return removeBackendListener;
    });
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any) => {
      if (channel === INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG) {
        return loadFrontendConfigResponse;
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
  ApiClient,
  INVOKE_CHANNELS,
  IpcBridge,
  ON_CHANNELS,
  SEND_CHANNELS,
};
