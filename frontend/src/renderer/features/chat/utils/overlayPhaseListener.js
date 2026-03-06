import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { parseResponseOverlayPhasePayload } from './responseOverlayPhasePayload';
import { RESPONSE_OVERLAY_PHASE } from './responseOverlayPhaseContract';

let currentOverlayPhase = RESPONSE_OVERLAY_PHASE.IDLE;
let removeIpcListener = null;
const storeSubscribers = new Set();

function notifyStoreSubscribers() {
  for (const onStoreChange of storeSubscribers) {
    onStoreChange();
  }
}

function ensureIpcSubscription() {
  if (removeIpcListener) {
    return;
  }
  removeIpcListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_PHASE, (payload) => {
    const parsedPayload = parseResponseOverlayPhasePayload(payload);
    if (!parsedPayload) {
      return;
    }
    currentOverlayPhase = parsedPayload.phase;
    notifyStoreSubscribers();
  });
}

function disposeIpcSubscriptionIfIdle() {
  if (storeSubscribers.size > 0) {
    return;
  }
  removeIpcListener?.();
  removeIpcListener = null;
  currentOverlayPhase = RESPONSE_OVERLAY_PHASE.IDLE;
}

export function subscribeResponseOverlayPhaseStore(onStoreChange) {
  storeSubscribers.add(onStoreChange);
  ensureIpcSubscription();
  return () => {
    storeSubscribers.delete(onStoreChange);
    disposeIpcSubscriptionIfIdle();
  };
}

export function getResponseOverlayPhaseSnapshot() {
  return currentOverlayPhase;
}
