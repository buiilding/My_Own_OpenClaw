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
  let loadFrontendConfigResponse: any;
  let clientUserIdResponse: any;
  const mockUpdateTranscriptSession = updateTranscriptSession as jest.Mock;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppConfigProvider>{children}</AppConfigProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    removeBackendListener = jest.fn();
    loadFrontendConfigResponse = null;
    clientUserIdResponse = null;

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
    expect(backendHandler).toEqual(expect.any(Function));

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

  test('ignores unsupported backend events', () => {
    const settingsHandlers = {
      handleModelsListed: jest.fn(),
    };
    (useSettingsManagement as jest.Mock).mockReturnValue(settingsHandlers);

    renderHook(() => useAppConfigContext(), { wrapper });

    const backendHandler = listeners.get(ON_CHANNELS.FROM_BACKEND);
    expect(backendHandler).toEqual(expect.any(Function));

    act(() => {
      backendHandler?.({
        type: 'status-updated',
        payload: { status: 'ok' },
      });
    });

    expect(settingsHandlers.handleModelsListed).not.toHaveBeenCalled();
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

  test('skips disk-sync writes when disk config matches stored config', async () => {
    loadFrontendConfigResponse = { voice_mode_enabled: false };

    renderHook(() => useAppConfigContext(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveConfigToStorage).not.toHaveBeenCalled();
    expect(ApiClient.updateSettings).not.toHaveBeenCalled();
  });

  test('applies disk config when it differs from stored config', async () => {
    loadFrontendConfigResponse = {
      voice_mode_enabled: true,
      selected_model_id: 'model-x',
      model_provider: 'openai',
    };

    renderHook(() => useAppConfigContext(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveConfigToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_mode_enabled: false,
        selected_model_id: 'model-x',
        model_provider: 'openai',
      }),
      expect.any(Number),
    );
    expect(ApiClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_mode_enabled: false,
        selected_model_id: 'model-x',
        model_provider: 'openai',
      }),
    );
  });

  test('keeps updateConfig callback stable across config updates', () => {
    const { result } = renderHook(() => useAppConfigContext(), { wrapper });
    const firstUpdateConfig = result.current.updateConfig;

    act(() => {
      result.current.updateConfig({
        voice_mode_enabled: false,
        selected_model_id: 'model-y',
        model_provider: 'openai',
      });
    });

    expect(result.current.updateConfig).toBe(firstUpdateConfig);
  });

  test('updates transcript session when client user id resolves', async () => {
    clientUserIdResponse = { userId: 'client-user-1' };

    renderHook(() => useAppConfigContext(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(undefined, 'client-user-1');
  });

  test('updates transcript session from IPC status events with userId', () => {
    renderHook(() => useAppConfigContext(), { wrapper });

    const ipcStatusHandler = listeners.get(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ userId: 'ipc-user-1' });
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(undefined, 'ipc-user-1');
  });

  test('syncs current config to backend when IPC status reports connected', () => {
    renderHook(() => useAppConfigContext(), { wrapper });

    const ipcStatusHandler = listeners.get(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ isConnected: true });
    });

    expect(ApiClient.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ voice_mode_enabled: false }),
    );
  });

  test('does not sync config when IPC status reports disconnected', () => {
    renderHook(() => useAppConfigContext(), { wrapper });

    const ipcStatusHandler = listeners.get(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ isConnected: false });
    });

    expect(ApiClient.updateSettings).not.toHaveBeenCalled();
  });

  test('ignores IPC status events when userId is invalid', () => {
    renderHook(() => useAppConfigContext(), { wrapper });

    const ipcStatusHandler = listeners.get(ON_CHANNELS.IPC_STATUS);
    expect(ipcStatusHandler).toEqual(expect.any(Function));

    act(() => {
      ipcStatusHandler?.({ userId: '' });
    });

    expect(mockUpdateTranscriptSession).not.toHaveBeenCalled();
  });

  test('wakeword toggle events update wakewordActive state only for boolean payloads', () => {
    const { result } = renderHook(() => useAppConfigContext(), { wrapper });
    expect(result.current.wakewordActive).toBe(false);

    const wakewordHandler = listeners.get(ON_CHANNELS.WAKEWORD_TOGGLE);
    expect(wakewordHandler).toEqual(expect.any(Function));

    act(() => {
      wakewordHandler?.({ enabled: true });
    });
    expect(result.current.wakewordActive).toBe(true);

    act(() => {
      wakewordHandler?.({ enabled: 'yes' });
    });
    expect(result.current.wakewordActive).toBe(true);
  });

  test('warns when disk config load fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any) => {
      if (channel === INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG) {
        throw new Error('disk-load-failed');
      }
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return null;
      }
      return null;
    });

    renderHook(() => useAppConfigContext(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[Config] Failed to load config from disk:',
      'disk-load-failed',
    );
    warnSpy.mockRestore();
  });

  test('warns when save-to-disk invoke fails during updateConfig', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (channel: any) => {
      if (channel === INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG) {
        return null;
      }
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return null;
      }
      if (channel === INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG) {
        throw new Error('disk-save-failed');
      }
      return null;
    });

    const { result } = renderHook(() => useAppConfigContext(), { wrapper });

    act(() => {
      result.current.updateConfig({
        voice_mode_enabled: false,
        selected_model_id: 'model-save-err',
        model_provider: 'openai',
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[Settings Update] Failed to save config to disk:',
      'disk-save-failed',
    );
    warnSpy.mockRestore();
  });
});
