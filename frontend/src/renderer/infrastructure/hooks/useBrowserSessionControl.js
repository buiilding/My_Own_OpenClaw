/**
 * Provides the use browser session control module for the renderer UI.
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  connectBrowserSession,
  disconnectBrowserSession,
  enableInteractiveBrowserSessionPolling,
  getBrowserSessionSnapshot,
  subscribeBrowserSessionStore,
  switchBrowserSessionTab,
} from '../runtime/browserSessionStore';

export function useBrowserSessionControl({ interactivePolling = false } = {}) {
  const snapshot = useSyncExternalStore(
    subscribeBrowserSessionStore,
    getBrowserSessionSnapshot,
    getBrowserSessionSnapshot,
  );

  useEffect(() => {
    if (!interactivePolling) {
      return undefined;
    }
    return enableInteractiveBrowserSessionPolling();
  }, [interactivePolling]);

  return {
    ...snapshot,
    connectBrowser: connectBrowserSession,
    disconnectBrowser: disconnectBrowserSession,
    switchBrowserTab: switchBrowserSessionTab,
  };
}
