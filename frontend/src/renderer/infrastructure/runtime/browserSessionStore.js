/**
 * Stores and retrieves browser session state for the renderer UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { DESKTOP_RUNTIME_INVOKE_CHANNELS } from '../ipc/channels';
import { SDK_RUNTIME_COMMANDS } from '../../app/runtime/desktopConversationRuntimeContracts';
import {
  getLocalRuntimeStatusSnapshot,
  subscribeLocalRuntimeStatusStore,
} from './localRuntimeStatusStore';

const DEFAULT_CONNECTED_POLL_MS = 2000;
const INTERACTIVE_CONNECTED_POLL_MS = 1000;
const BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH = 'browser.session_control';

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
  const tabIndex = Number.isInteger(tab?.tab_index) ? tab.tab_index : null;
  const url = normalizeString(tab?.url);
  const title = normalizeString(tab?.title);
  return {
    targetId: tabIndex !== null ? String(tabIndex) : '',
    tabIndex,
    title,
    url,
    label: formatBrowserTabLabel({ title, url }),
  };
}

function buildDisconnectedSnapshot({
  localRuntimeReady = false,
  error = '',
  busyAction = '',
} = {}) {
  return Object.freeze({
    localRuntimeReady,
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
    current.localRuntimeReady !== next.localRuntimeReady
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
let localRuntimeUnsubscribe = null;
let pollIntervalId = null;
let interactivePollingRequests = 0;
let syncRequestId = 0;
let diagnosticsTraceId = '';
const storeSubscribers = new Set();

function createBrowserSessionDiagnosticId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getBrowserSessionDiagnosticsTraceId() {
  if (!diagnosticsTraceId) {
    diagnosticsTraceId = createBrowserSessionDiagnosticId('browser-session');
  }
  return diagnosticsTraceId;
}

function emitBrowserSessionDiagnostic({
  stage,
  status = 'succeeded',
  requestId = createBrowserSessionDiagnosticId('browser-session'),
  durationMs,
  data = {},
  error = null,
} = {}) {
  if (!stage) {
    return;
  }
  const payload = {
    _diagnostics: {
      path: BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
      traceId: getBrowserSessionDiagnosticsTraceId(),
      requestId,
    },
    stage,
    status,
    runtime: 'renderer',
    data,
    ...(Number.isFinite(durationMs) ? { durationMs } : {}),
    ...(error ? { error } : {}),
  };
  void Promise.resolve(
    IpcBridge.invoke(DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE, {
      command: SDK_RUNTIME_COMMANDS.DIAGNOSTICS_APPEND,
      payload,
    }),
  ).catch(() => undefined);
}

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
    || currentSnapshot.localRuntimeReady !== true
  ) {
    return;
  }

  pollIntervalId = window.setInterval(() => {
    void syncBrowserSession();
  }, getConnectedPollIntervalMs());
}

function invalidateBrowserSessionSync() {
  syncRequestId += 1;
}

async function syncBrowserSession() {
  if (currentSnapshot.localRuntimeReady !== true) {
    emitBrowserSessionDiagnostic({
      stage: 'status_sync_suppressed',
      data: {
        localRuntimeReady: false,
        suppressed: true,
        reason: 'local_runtime_not_ready',
      },
    });
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
        localRuntimeReady: currentSnapshot.localRuntimeReady,
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
    const statusUrl = normalizeString(status?.url);
    const statusTitle = normalizeString(status?.title);
    const currentTab = (
      tabs.find((tab) => statusUrl && tab.url === statusUrl)
      || tabs.find((tab) => statusTitle && tab.title === statusTitle)
      || tabs[0]
      || normalizeTab({
        tab_index: 0,
        title: status?.title,
        url: status?.url,
      })
    );
    const nextTabs = tabs.some((tab) => tab.targetId === currentTab.targetId)
      ? tabs
      : [currentTab, ...tabs];

    applySnapshot(Object.freeze({
      localRuntimeReady: currentSnapshot.localRuntimeReady,
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

function handleLocalRuntimeStatusChange() {
  const runtimeStatus = getLocalRuntimeStatusSnapshot();
  emitBrowserSessionDiagnostic({
    stage: 'local_runtime_status_observed',
    data: {
      localRuntimeReady: runtimeStatus.ready === true,
      ready: runtimeStatus.ready === true,
      status: normalizeString(runtimeStatus.status) || 'unknown',
    },
    error: runtimeStatus.ready === true ? null : normalizeString(runtimeStatus.error),
  });
  if (runtimeStatus.ready !== true) {
    applySnapshot(buildDisconnectedSnapshot({
      localRuntimeReady: false,
      error: normalizeString(runtimeStatus.error),
      busyAction: '',
    }));
    return;
  }

  updateSnapshot({
    localRuntimeReady: true,
    error: currentSnapshot.connected ? currentSnapshot.error : '',
  });
  void syncBrowserSession();
}

function ensureRuntimeSubscription() {
  if (localRuntimeUnsubscribe) {
    return;
  }

  localRuntimeUnsubscribe = subscribeLocalRuntimeStatusStore(() => {
    handleLocalRuntimeStatusChange();
  });

  handleLocalRuntimeStatusChange();
}

function disposeRuntimeSubscriptionIfIdle() {
  if (storeSubscribers.size > 0) {
    return;
  }

  localRuntimeUnsubscribe?.();
  localRuntimeUnsubscribe = null;
  stopPolling();
  interactivePollingRequests = 0;
  applySnapshot(buildDisconnectedSnapshot({
    localRuntimeReady: getLocalRuntimeStatusSnapshot().ready === true,
    error: '',
  }));
}

function mergeCurrentTab(snapshot, nextTab, result = {}) {
  const resultTitle = normalizeString(result?.title);
  const resultUrl = normalizeString(result?.url);
  const fallbackTabIndex = Number(snapshot.currentTargetId);
  let tabIndex = 0;
  if (Number.isInteger(nextTab?.tabIndex)) {
    tabIndex = nextTab.tabIndex;
  } else if (Number.isInteger(fallbackTabIndex)) {
    tabIndex = fallbackTabIndex;
  }
  const mergedCurrentTab = {
    tab_index: tabIndex,
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
  if (currentSnapshot.localRuntimeReady !== true) {
    emitBrowserSessionDiagnostic({
      stage: 'connect_suppressed',
      data: {
        localRuntimeReady: false,
        busyAction: currentSnapshot.busyAction,
        suppressed: true,
        reason: 'local_runtime_not_ready',
      },
    });
    return;
  }

  if (currentSnapshot.busyAction) {
    emitBrowserSessionDiagnostic({
      stage: 'connect_suppressed',
      data: {
        localRuntimeReady: true,
        busyAction: currentSnapshot.busyAction,
        suppressed: true,
        reason: 'busy',
      },
    });
    return;
  }

  const requestId = createBrowserSessionDiagnosticId('connect');
  const startedAt = Date.now();
  emitBrowserSessionDiagnostic({
    stage: 'connect',
    status: 'started',
    requestId,
    data: {
      localRuntimeReady: true,
      busyAction: 'connect',
      action: 'connect',
    },
  });
  updateSnapshot({ busyAction: 'connect' });
  try {
    await runBrowserAction('connect');
    await syncBrowserSession();
    emitBrowserSessionDiagnostic({
      stage: 'connect',
      status: 'succeeded',
      requestId,
      durationMs: Date.now() - startedAt,
      data: {
        localRuntimeReady: true,
        action: 'connect',
        success: true,
      },
    });
  } catch (error) {
    updateSnapshot({
      error: normalizeString(error?.message) || 'Failed to connect the browser.',
    });
    emitBrowserSessionDiagnostic({
      stage: 'connect',
      status: 'failed',
      requestId,
      durationMs: Date.now() - startedAt,
      data: {
        localRuntimeReady: true,
        action: 'connect',
        success: false,
      },
      error,
    });
  } finally {
    updateSnapshot({ busyAction: '' });
  }
}

export async function disconnectBrowserSession() {
  if (currentSnapshot.localRuntimeReady !== true || currentSnapshot.busyAction) {
    return;
  }

  invalidateBrowserSessionSync();
  updateSnapshot({ busyAction: 'disconnect' });
  try {
    await runBrowserAction('close');
    applySnapshot(buildDisconnectedSnapshot({
      localRuntimeReady: currentSnapshot.localRuntimeReady,
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
    currentSnapshot.localRuntimeReady !== true
    || currentSnapshot.busyAction
    || !nextTargetId
    || nextTargetId === currentSnapshot.currentTargetId
  ) {
    return;
  }

  const nextTab = currentSnapshot.tabs.find((tab) => tab.targetId === nextTargetId) || null;
  const nextTabIndex = Number.isInteger(nextTab?.tabIndex) ? nextTab.tabIndex : Number(nextTargetId);
  if (!Number.isInteger(nextTabIndex) || nextTabIndex < 0) {
    updateSnapshot({
      error: 'Browser tab switch requires a numeric tab index.',
    });
    return;
  }
  updateSnapshot({ busyAction: 'switch' });

  try {
    const result = await runBrowserAction('switch', {
      tab_index: nextTabIndex,
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
