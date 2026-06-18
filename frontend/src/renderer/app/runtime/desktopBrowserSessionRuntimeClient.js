/**
 * Coordinates renderer browser session controls for feature clients.
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  connectBrowserSession,
  disconnectBrowserSession,
  enableInteractiveBrowserSessionPolling,
  getBrowserSessionSnapshot,
  subscribeBrowserSessionStore,
  switchBrowserSessionTab,
} from '../../infrastructure/runtime/browserSessionStore';

export function useDesktopBrowserSessionControl({ interactivePolling = false } = {}) {
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
