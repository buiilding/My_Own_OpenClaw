/**
 * Coordinates the desktop settings runtime client for the renderer UI.
 */

import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from '../../infrastructure/api/windieSdkClient';
import { createDesktopAgentRuntimeTransport } from './desktopAgentRuntimeTransport';

type RuntimeSettingsPatch = Record<string, unknown>;

const DASHBOARD_MODEL_LIST_REQUEST_GUARD_KEY = '__desktop_agent_models_list_requested__';

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
  listModels(): Promise<void> {
    return createDesktopAgentRuntimeTransport(null).listModels().then(() => undefined);
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
    void this.listModels().catch((error) => {
      const message = error instanceof Error ? error.message : error;
      console.warn('[SettingsRuntime] Failed to request startup model list:', message);
    });
    return true;
  },

  updateSettings(config: RuntimeSettingsPatch): void {
    void createDesktopAgentRuntimeTransport(null).updateSettings(config);
  },

  setModel(selection: WindieModelSelection): void {
    void createDesktopAgentRuntimeTransport(null).updateSettings(
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
