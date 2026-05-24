import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import {
  getLocalBackendStatusSnapshot,
  subscribeLocalBackendStatusStore,
} from './localBackendStatusStore';

const DEFAULT_CONNECTED_POLL_MS = 2000;
const INTERACTIVE_CONNECTED_POLL_MS = 1000;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatBrowserTabLabel(tab) {
  const title = normalizeString(tab?.title);
  if (title) {
    return title;
  }

  const url = normalizeString(tab?.url);
  if (!url || url === 'about:blank') {
    return 'New tab';
  }

  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    return `${parsedUrl.hostname}${path}`;
  } catch (_error) {
    return url;
  }
}

function normalizeTab(tab) {
  const targetId = normalizeString(tab?.target_id || tab?.targetId);
  const url = normalizeString(tab?.url);
  const title = normalizeString(tab?.title);
  return {
    targetId,
    title,
    url,
    label: formatBrowserTabLabel({ title, url }),
  };
}

function buildDisconnectedSnapshot({
  localBackendReady = false,
  error = '',
  busyAction = '',
} = {}) {
  return Object.freeze({
    localBackendReady,
    connected: false,
    currentTargetId: '',
    currentTabLabel: '',
    currentTabTitle: '',
    currentTabUrl: '',
    tabs: [],
    busyAction,
    error,
  });
}

function snapshotsMatch(current, next) {
  if (
    current.localBackendReady !== next.localBackendReady
    || current.connected !== next.connected
    || current.currentTargetId !== next.currentTargetId
    || current.currentTabLabel !== next.currentTabLabel
    || current.currentTabTitle !== next.currentTabTitle
    || current.currentTabUrl !== next.currentTabUrl
    || current.busyAction !== next.busyAction
    || current.error !== next.error
    || current.tabs.length !== next.tabs.length
  ) {
    return false;
  }

  for (let index = 0; index < current.tabs.length; index += 1) {
    const currentTab = current.tabs[index];
    const nextTab = next.tabs[index];
    if (
      currentTab?.targetId !== nextTab?.targetId
      || currentTab?.title !== nextTab?.title
      || currentTab?.url !== nextTab?.url
      || currentTab?.label !== nextTab?.label
    ) {
      return false;
    }
  }

  return true;
}

let currentSnapshot = buildDisconnectedSnapshot();
let localBackendUnsubscribe = null;
let pollIntervalId = null;
let interactivePollingRequests = 0;
let syncRequestId = 0;
const storeSubscribers = new Set();

function notifyStoreSubscribers() {
  for (const onStoreChange of storeSubscribers) {
    onStoreChange();
  }
}

function applySnapshot(nextSnapshot) {
  if (snapshotsMatch(currentSnapshot, nextSnapshot)) {
    return;
  }
  currentSnapshot = nextSnapshot;
  notifyStoreSubscribers();
  refreshPollingState();
}

function updateSnapshot(partial) {
  applySnapshot(
    Object.freeze({
      ...currentSnapshot,
      ...partial,
    }),
  );
}

async function runBrowserAction(action, extras = {}) {
  const result = await IpcBridge.invoke(INVOKE_CHANNELS.RUN_BROWSER_ACTION, {
    action,
    ...extras,
  });

  if (!result || result.success !== true) {
    throw new Error(
      normalizeString(result?.error) || `Browser action '${action}' failed.`,
    );
  }

  return result?.data && typeof result.data === 'object'
    ? result.data
    : {};
}

function getConnectedPollIntervalMs() {
  return interactivePollingRequests > 0
    ? INTERACTIVE_CONNECTED_POLL_MS
    : DEFAULT_CONNECTED_POLL_MS;
}

function stopPolling() {
  if (pollIntervalId === null) {
    return;
  }
  window.clearInterval(pollIntervalId);
  pollIntervalId = null;
}

function refreshPollingState() {
  stopPolling();

  if (
    typeof window === 'undefined'
    || storeSubscribers.size === 0
    || currentSnapshot.connected !== true
    || currentSnapshot.localBackendReady !== true
  ) {
    return;
  }

  pollIntervalId = window.setInterval(() => {
    void syncBrowserSession();
  }, getConnectedPollIntervalMs());
}

async function syncBrowserSession() {
  if (currentSnapshot.localBackendReady !== true) {
    return;
  }

  const requestId = syncRequestId + 1;
  syncRequestId = requestId;

  try {
    const status = await runBrowserAction('status');
    if (requestId !== syncRequestId) {
      return;
    }

    if (status.connected !== true) {
      applySnapshot(buildDisconnectedSnapshot({
        localBackendReady: currentSnapshot.localBackendReady,
        error: '',
        busyAction: currentSnapshot.busyAction,
      }));
      return;
    }

    const tabsPayload = await runBrowserAction('get_tabs');
    if (requestId !== syncRequestId) {
      return;
    }

    const tabs = Array.isArray(tabsPayload?.tabs)
      ? tabsPayload.tabs
        .map((tab) => normalizeTab(tab))
        .filter((tab) => tab.targetId)
      : [];
    const currentTargetId = normalizeString(status?.target_id || status?.targetId);
    const currentTab = (
      tabs.find((tab) => tab.targetId === currentTargetId)
      || tabs[0]
      || normalizeTab({
        target_id: currentTargetId || 'active-tab',
        title: status?.title,
        url: status?.url,
      })
    );
    const nextTabs = tabs.some((tab) => tab.targetId === currentTab.targetId)
      ? tabs
      : [currentTab, ...tabs];

    applySnapshot(Object.freeze({
      localBackendReady: currentSnapshot.localBackendReady,
      connected: true,
      currentTargetId: currentTab.targetId,
      currentTabLabel: currentTab.label,
      currentTabTitle: currentTab.title,
      currentTabUrl: currentTab.url,
      tabs: nextTabs,
      busyAction: currentSnapshot.busyAction,
      error: '',
    }));
  } catch (error) {
    if (requestId !== syncRequestId) {
      return;
    }

    updateSnapshot({
      error: normalizeString(error?.message) || 'Failed to sync the browser session.',
    });
  }
}

function handleLocalBackendStatusChange() {
  const backendStatus = getLocalBackendStatusSnapshot();
  if (backendStatus.ready !== true) {
    applySnapshot(buildDisconnectedSnapshot({
      localBackendReady: false,
      error: normalizeString(backendStatus.error),
      busyAction: '',
    }));
    return;
  }

  updateSnapshot({
    localBackendReady: true,
    error: currentSnapshot.connected ? currentSnapshot.error : '',
  });
  void syncBrowserSession();
}

function ensureRuntimeSubscription() {
  if (localBackendUnsubscribe) {
    return;
  }

  localBackendUnsubscribe = subscribeLocalBackendStatusStore(() => {
    handleLocalBackendStatusChange();
  });

  handleLocalBackendStatusChange();
}

function disposeRuntimeSubscriptionIfIdle() {
  if (storeSubscribers.size > 0) {
    return;
  }

  localBackendUnsubscribe?.();
  localBackendUnsubscribe = null;
  stopPolling();
  interactivePollingRequests = 0;
  applySnapshot(buildDisconnectedSnapshot({
    localBackendReady: getLocalBackendStatusSnapshot().ready === true,
    error: '',
  }));
}

function mergeCurrentTab(snapshot, nextTab, result = {}) {
  const resultTitle = normalizeString(result?.title);
  const resultUrl = normalizeString(result?.url);
  const mergedCurrentTab = {
    targetId: nextTab?.targetId || snapshot.currentTargetId,
    title: resultTitle || nextTab?.title || snapshot.currentTabTitle,
    url: resultUrl || nextTab?.url || snapshot.currentTabUrl,
  };
  const mergedTab = normalizeTab(mergedCurrentTab);
  const mergedTabs = snapshot.tabs.map((tab) => (
    tab.targetId === mergedTab.targetId ? mergedTab : tab
  ));
  if (!mergedTabs.some((tab) => tab.targetId === mergedTab.targetId)) {
    mergedTabs.unshift(mergedTab);
  }
  return {
    currentTargetId: mergedTab.targetId,
    currentTabLabel: mergedTab.label,
    currentTabTitle: mergedTab.title,
    currentTabUrl: mergedTab.url,
    tabs: mergedTabs,
  };
}

export function subscribeBrowserSessionStore(onStoreChange) {
  storeSubscribers.add(onStoreChange);
  ensureRuntimeSubscription();

  return () => {
    storeSubscribers.delete(onStoreChange);
    disposeRuntimeSubscriptionIfIdle();
  };
}

export function getBrowserSessionSnapshot() {
  return currentSnapshot;
}

export function enableInteractiveBrowserSessionPolling() {
  interactivePollingRequests += 1;
  refreshPollingState();
  return () => {
    interactivePollingRequests = Math.max(0, interactivePollingRequests - 1);
    refreshPollingState();
  };
}

export async function connectBrowserSession() {
  if (currentSnapshot.localBackendReady !== true || currentSnapshot.busyAction) {
    return;
  }

  updateSnapshot({ busyAction: 'connect' });
  try {
    await runBrowserAction('connect');
    await syncBrowserSession();
  } catch (error) {
    updateSnapshot({
      error: normalizeString(error?.message) || 'Failed to connect the browser.',
    });
  } finally {
    updateSnapshot({ busyAction: '' });
  }
}

export async function disconnectBrowserSession() {
  if (currentSnapshot.localBackendReady !== true || currentSnapshot.busyAction) {
    return;
  }

  updateSnapshot({ busyAction: 'disconnect' });
  try {
    await runBrowserAction('close');
    applySnapshot(buildDisconnectedSnapshot({
      localBackendReady: currentSnapshot.localBackendReady,
      error: '',
      busyAction: '',
    }));
  } catch (error) {
    updateSnapshot({
      busyAction: '',
      error: normalizeString(error?.message) || 'Failed to disconnect the browser.',
    });
  }
}

export async function switchBrowserSessionTab(targetId) {
  const nextTargetId = normalizeString(targetId);
  if (
    currentSnapshot.localBackendReady !== true
    || currentSnapshot.busyAction
    || !nextTargetId
    || nextTargetId === currentSnapshot.currentTargetId
  ) {
    return;
  }

  const nextTab = currentSnapshot.tabs.find((tab) => tab.targetId === nextTargetId) || null;
  updateSnapshot({ busyAction: 'switch' });

  try {
    const result = await runBrowserAction('switch', {
      tab_id: nextTargetId,
      activate: false,
    });
    updateSnapshot({
      busyAction: '',
      error: '',
      ...mergeCurrentTab(currentSnapshot, nextTab, result),
    });
  } catch (error) {
    updateSnapshot({
      busyAction: '',
      error: normalizeString(error?.message) || 'Failed to switch browser tabs.',
    });
    await syncBrowserSession();
  }
}
