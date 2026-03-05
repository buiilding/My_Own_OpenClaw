import { useEffect } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { type ToolBundleEvent, type ToolCallEvent, isBackendEvent } from '../../../types/backendEvents';

type ToolRunnerBackendListenerOptions = {
  enabled: boolean;
  handleToolBundle: (event: ToolBundleEvent) => void;
  handleToolCall: (event: ToolCallEvent) => void;
};

export function useToolRunnerBackendListener({
  enabled,
  handleToolBundle,
  handleToolCall,
}: ToolRunnerBackendListenerOptions): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data: unknown) => {
      if (!isBackendEvent(data)) {
        return;
      }
      if (data.type === 'tool-bundle') {
        handleToolBundle(data);
      }
      if (data.type === 'tool-call') {
        handleToolCall(data);
      }
    });

    return removeListener;
  }, [enabled, handleToolBundle, handleToolCall]);
}
