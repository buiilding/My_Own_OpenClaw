/**
 * Defines use memory settings actions configuration for the renderer UI.
 */

import { useState } from 'react';
import { DesktopMemoryRuntimeClient } from '../../../../../app/runtime/desktopMemoryRuntimeClient';
import { DesktopMemorySettingsDialogRuntime } from '../../../../../app/runtime/desktopMemorySettingsDialogRuntime';
import { DesktopTranscriptSessionInfoRuntimeClient } from '../../../../../app/runtime/desktopTranscriptSessionInfoRuntimeClient';
import { DesktopRuntimeSkin } from '../../../../../app/skin/desktopRuntimeSkin';

const memorySettingsSkin = DesktopRuntimeSkin.desktopRuntimeSkin.settings.memory;

export function useMemorySettingsActions() {
  const sessionInfo = DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo();
  const memoryAdminUserId = DesktopMemoryRuntimeClient.resolveMemoryAdminUserId(sessionInfo);
  const [pendingAction, setPendingAction] = useState(null);
  const [status, setStatus] = useState({
    tone: 'idle',
    message: '',
  });

  const runDestructiveAction = async ({
    actionId,
    confirmMessage,
    run,
    runArgs = [],
    requireActiveUser = false,
    successMessage,
    onSuccess,
  }) => {
    if (pendingAction) {
      return false;
    }

    if (requireActiveUser && !memoryAdminUserId) {
      setStatus({
        tone: 'error',
        message: memorySettingsSkin.requireUserMessage,
      });
      return false;
    }

    const confirmed = DesktopMemorySettingsDialogRuntime.confirmMemorySettingsDestructiveAction(
      confirmMessage,
    );
    if (!confirmed) {
      return false;
    }

    setPendingAction(actionId);
    setStatus({ tone: 'idle', message: '' });

    try {
      const data = await run(...runArgs);

      setStatus({
        tone: 'success',
        message: successMessage,
      });
      if (typeof onSuccess === 'function') {
        try {
          await onSuccess(data);
        } catch (callbackError) {
          console.warn('Destructive action succeeded, but refresh callback failed.', callbackError);
        }
      }
      return true;
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error?.message || memorySettingsSkin.destructiveFailureFallback,
      });
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const clearLocalMemory = async () => runDestructiveAction({
    actionId: 'memory',
    confirmMessage: memorySettingsSkin.deleteMemories.confirmMessage,
    run: DesktopMemoryRuntimeClient.clearLocalMemory,
    successMessage: memorySettingsSkin.deleteMemories.successMessage,
  });

  const clearChatHistory = async (onSuccess) => runDestructiveAction({
    actionId: 'chats',
    confirmMessage: memorySettingsSkin.deleteChats.confirmMessage,
    run: DesktopMemoryRuntimeClient.clearChatHistory,
    runArgs: [memoryAdminUserId],
    requireActiveUser: true,
    successMessage: memorySettingsSkin.deleteChats.successMessage,
    onSuccess,
  });

  return {
    clearLocalMemory,
    clearChatHistory,
    pendingAction,
    status,
  };
}
