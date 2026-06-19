/**
 * Provides the wakeword controller module for the renderer UI.
 */

import { useCallback } from 'react';
import { useWakewordDetection } from '../features/voice/hooks/useWakewordDetection';
import { useAppConfigContext } from './providers/AppConfigContext';
import { DesktopVoiceRuntimeClient } from './runtime/desktopVoiceRuntimeClient';
import { DesktopWindowRuntimeClient } from './runtime/desktopWindowRuntimeClient';

function WakewordController() {
  const { wakewordActive, wakewordEnabled } = useAppConfigContext();

  const handleWakewordDetected = useCallback(() => {
    console.log('[WakewordController] Wakeword detected!');
    DesktopVoiceRuntimeClient.wakewordDetected();
    DesktopWindowRuntimeClient.showChatboxWithValues(null, 'wakeword').catch((error) => {
      console.warn('[WakewordController] Failed to show chatbox:', error);
    });
  }, []);

  useWakewordDetection(wakewordActive, handleWakewordDetected, {
    wakewordPreferenceEnabled: wakewordEnabled,
  });

  return null;
}

export default WakewordController;
