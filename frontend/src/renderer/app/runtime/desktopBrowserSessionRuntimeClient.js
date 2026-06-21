/**
 * Coordinates renderer browser session controls for feature clients.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import {
  connectBrowserSession,
  disconnectBrowserSession,
  enableInteractiveBrowserSessionPolling,
  getBrowserSessionSnapshot,
  subscribeBrowserSessionStore,
  switchBrowserSessionTab,
} from '../../infrastructure/runtime/browserSessionStore';

const DEFAULT_BROWSER_SESSION_COPY = Object.freeze({
  connectTitle: 'Connect browser',
  connectLabel: 'Connect browser',
  connectingLabel: 'Connecting browser...',
  unavailableLabel: 'Browser unavailable',
  startingRuntimeLabel: 'Starting local runtime...',
  connectedLabelPrefix: 'Browser Tab:',
  tabFallbackLabel: 'New tab',
});

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getBrowserSessionTabs(snapshot) {
  return Array.isArray(snapshot?.tabs) ? snapshot.tabs : [];
}

function resolveBrowserSessionCurrentTabIndex(snapshot) {
  const tabs = getBrowserSessionTabs(snapshot);
  const currentTargetId = normalizeString(snapshot?.currentTargetId);
  return tabs.findIndex((tab) => tab?.targetId === currentTargetId);
}

function resolveBrowserSessionCarouselTargetId(snapshot, step) {
  const tabs = getBrowserSessionTabs(snapshot);
  if (tabs.length <= 1) {
    return '';
  }

  const currentTabIndex = resolveBrowserSessionCurrentTabIndex(snapshot);
  const safeCurrentIndex = currentTabIndex >= 0 ? currentTabIndex : 0;
  const nextIndex = (safeCurrentIndex + step + tabs.length) % tabs.length;
  return normalizeString(tabs[nextIndex]?.targetId);
}

function resolveBrowserSessionControlPresentation(snapshot, copy = {}) {
  const resolvedCopy = {
    ...DEFAULT_BROWSER_SESSION_COPY,
    ...(copy || {}),
  };
  const localRuntimeReady = snapshot?.localRuntimeReady === true;
  const connected = snapshot?.connected === true;
  const busyAction = normalizeString(snapshot?.busyAction);
  const error = normalizeString(snapshot?.error);
  const tabLabel = normalizeString(snapshot?.currentTabLabel) || resolvedCopy.tabFallbackLabel;
  const buttonTitle = connected
    ? (
      normalizeString(snapshot?.currentTabTitle)
      || normalizeString(snapshot?.currentTabUrl)
      || tabLabel
    )
    : (error || resolvedCopy.connectTitle);
  const controlsDisabled = Boolean(busyAction) || !localRuntimeReady;
  const tabControlLabel = `${resolvedCopy.connectedLabelPrefix} ${tabLabel}`.trim();
  const disconnectedButtonLabel = !localRuntimeReady && error
    ? resolvedCopy.unavailableLabel
    : resolvedCopy.connectLabel;
  const disconnectedButtonText = localRuntimeReady
    ? (busyAction === 'connect' ? resolvedCopy.connectingLabel : resolvedCopy.connectLabel)
    : (error ? resolvedCopy.unavailableLabel : resolvedCopy.startingRuntimeLabel);

  return Object.freeze({
    buttonTitle,
    canOpenPicker: localRuntimeReady && connected && !busyAction,
    controlsDisabled,
    disconnectedButtonLabel,
    disconnectedButtonText,
    hasMultipleTabs: getBrowserSessionTabs(snapshot).length > 1,
    tabControlLabel,
    tabLabel,
  });
}

export const DesktopBrowserSessionRuntimeClient = Object.freeze({
  resolveBrowserSessionControlPresentation,
  resolveBrowserSessionCarouselTargetId,
});

export function useDesktopBrowserSessionControl({
  interactivePolling = false,
  copy = DEFAULT_BROWSER_SESSION_COPY,
} = {}) {
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

  const presentation = useMemo(() => (
    resolveBrowserSessionControlPresentation(snapshot, copy)
  ), [copy, snapshot]);

  const switchBrowserTabByStep = useCallback((step) => {
    const targetId = resolveBrowserSessionCarouselTargetId(snapshot, step);
    if (!targetId) {
      return undefined;
    }
    return switchBrowserSessionTab(targetId);
  }, [snapshot]);

  return {
    ...snapshot,
    connectBrowser: connectBrowserSession,
    disconnectBrowser: disconnectBrowserSession,
    presentation,
    switchBrowserTab: switchBrowserSessionTab,
    switchBrowserTabByStep,
  };
}
