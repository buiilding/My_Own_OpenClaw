import { useEffect, useState } from 'react';
import { subscribeResponseOverlayPhase } from '../utils/overlayPhaseListener';
import { RESPONSE_OVERLAY_PHASE } from '../utils/responseOverlayPhaseContract';

export function useResponseOverlayPhase() {
  const [overlayPhase, setOverlayPhase] = useState(RESPONSE_OVERLAY_PHASE.IDLE);

  useEffect(() => {
    return subscribeResponseOverlayPhase(setOverlayPhase);
  }, []);

  return overlayPhase;
}
