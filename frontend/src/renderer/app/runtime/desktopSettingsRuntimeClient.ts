import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from '../../infrastructure/api/windieSdkClient';
import { createDesktopBackendTransport } from './desktopBackendTransport';

type RuntimeSettingsPatch = Record<string, unknown>;

const DASHBOARD_MODEL_LIST_REQUEST_GUARD_KEY = '__windie_models_list_requested__';

type DashboardModelListWindow = Window & {
  [DASHBOARD_MODEL_LIST_REQUEST_GUARD_KEY]?: boolean;
};

function isDashboardView(search: string): boolean {
  return !new URLSearchParams(search).get('view');
}

function getDashboardModelListWindow(): DashboardModelListWindow | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window as DashboardModelListWindow;
}

/**
 * Renderer settings/model command facade for the SDK runtime hosted by Electron main.
 *
 * App-level providers and model settings UI should use this module instead of
 * reaching for low-level backend IPC methods directly.
 */
export const DesktopSettingsRuntimeClient = {
  listModels(): void {
    void createDesktopBackendTransport(null).listModels();
  },

  requestDashboardStartupModelList(): boolean {
    const runtimeWindow = getDashboardModelListWindow();
    if (!runtimeWindow || !isDashboardView(runtimeWindow.location.search)) {
      return false;
    }
    if (runtimeWindow[DASHBOARD_MODEL_LIST_REQUEST_GUARD_KEY]) {
      return false;
    }

    runtimeWindow[DASHBOARD_MODEL_LIST_REQUEST_GUARD_KEY] = true;
    try {
      this.listModels();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : error;
      console.warn('[SettingsRuntime] Failed to request startup model list:', message);
      return false;
    }
  },

  updateSettings(config: RuntimeSettingsPatch): void {
    void createDesktopBackendTransport(null).updateSettings(config);
  },

  setModel(selection: WindieModelSelection): void {
    void createDesktopBackendTransport(null).updateSettings(
      buildModelSettingsPatch(selection, 'DesktopSettingsRuntimeClient.setModel'),
    );
  },

  resetDashboardStartupModelListForTests(): void {
    const runtimeWindow = getDashboardModelListWindow();
    if (runtimeWindow) {
      delete runtimeWindow[DASHBOARD_MODEL_LIST_REQUEST_GUARD_KEY];
    }
  },
};
