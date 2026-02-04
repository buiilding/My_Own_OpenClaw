import { useCallback } from 'react';
import { useWakewordDetection } from '../features/voice/hooks/useWakewordDetection';
import { ApiClient } from '../infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS } from '../infrastructure/ipc/bridge';
import { useAppConfigContext } from './providers/AppContextHooks';

function WakewordController() {
  const { wakewordActive } = useAppConfigContext();

  const handleWakewordDetected = useCallback(() => {
    console.log('[WakewordController] Wakeword detected!');
    ApiClient.wakewordDetected();
    IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX).catch((error) => {
      console.warn('[WakewordController] Failed to show chatbox:', error);
    });
  }, []);

  useWakewordDetection(wakewordActive, handleWakewordDetected);

  return null;
}

export default WakewordController;
