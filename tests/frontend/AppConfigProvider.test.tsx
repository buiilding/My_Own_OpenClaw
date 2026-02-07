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
jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    updateSettings: jest.fn(),
  },
}));

describe('AppConfigProvider', () => {
  const listeners = new Map<string, (data: any) => void>();
  let removeBackendListener: jest.Mock;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppConfigProvider>{children}</AppConfigProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    removeBackendListener = jest.fn();

    (loadConfigFromStorage as jest.Mock).mockReturnValue({ voice_mode_enabled: false });
    (useSettingsManagement as jest.Mock).mockReturnValue({
      handleModelsListed: jest.fn(),
    });

    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel: any, handler: any) => {
      listeners.set(channel, handler);
      return removeBackendListener;
    });
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any) => {
      if (channel === INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG) {
        return null;
      }
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return null;
      }
      return null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registers backend listener before requesting model list', () => {
    renderHook(() => useAppConfigContext(), { wrapper });

    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.FROM_BACKEND,
      expect.any(Function),
    );
    expect(IpcBridge.send).toHaveBeenCalledWith(
      SEND_CHANNELS.TO_BACKEND,
      { type: 'list-models' },
    );
  });

  test('routes models-listed event to settings handler', () => {
    const settingsHandlers = {
      handleModelsListed: jest.fn(),
    };
    (useSettingsManagement as jest.Mock).mockReturnValue(settingsHandlers);

    renderHook(() => useAppConfigContext(), { wrapper });

    const backendHandler = listeners.get(ON_CHANNELS.FROM_BACKEND);
    expect(backendHandler).toBeDefined();

    act(() => {
      backendHandler?.({
        type: 'models-listed',
        payload: {
          local_models: ['local-a'],
          online_models: ['online-b'],
        },
      });
    });

    expect(settingsHandlers.handleModelsListed).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'models-listed' }),
    );
  });

  test('skips persistence when updateConfig receives same config', () => {
    const { result } = renderHook(() => useAppConfigContext(), { wrapper });

    act(() => {
      result.current.updateConfig({ voice_mode_enabled: false });
    });

    expect(saveConfigToStorage).not.toHaveBeenCalled();
    expect(IpcBridge.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG,
      expect.anything(),
    );
    expect(ApiClient.updateSettings).not.toHaveBeenCalled();
  });

  test('removes backend listener on unmount', () => {
    const { unmount } = renderHook(() => useAppConfigContext(), { wrapper });

    unmount();

    expect(removeBackendListener).toHaveBeenCalled();
  });
});

