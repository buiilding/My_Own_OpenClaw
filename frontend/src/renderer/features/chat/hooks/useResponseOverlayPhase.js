import { useSyncExternalStore } from 'react';
import {
  getResponseOverlayPhaseSnapshot,
  subscribeResponseOverlayPhaseStore,
} from '../utils/overlayPhaseListener';

export function useResponseOverlayPhase() {
  return useSyncExternalStore(
    subscribeResponseOverlayPhaseStore,
    getResponseOverlayPhaseSnapshot,
    getResponseOverlayPhaseSnapshot,
  );
}
