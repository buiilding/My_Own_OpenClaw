/**
 * Defines use memory settings actions configuration for the renderer UI.
 */

import { useState } from 'react';
import { DesktopMemoryRuntimeClient } from '../../../../../app/runtime/desktopMemoryRuntimeClient';
import { useTranscriptSessionInfo } from '../../../hooks/useTranscriptSessionInfo';

export function useMemorySettingsActions() {
  const sessionInfo = useTranscriptSessionInfo();
  const userId = sessionInfo.userId || '';
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

    if (requireActiveUser && (!userId || userId === 'default_user')) {
      setStatus({
        tone: 'error',
        message: 'Connect WindieOS before deleting saved data.',
      });
      return false;
    }

    const confirmed = window.confirm(confirmMessage);
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
        message: error?.message || 'Failed to complete destructive action',
      });
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const clearLocalMemory = async () => runDestructiveAction({
    actionId: 'memory',
    confirmMessage: 'Delete saved episodic interaction memories and semantic memories? Chat transcripts will be kept.',
    run: DesktopMemoryRuntimeClient.clearLocalMemory,
    successMessage: 'Saved memories deleted.',
  });

  const clearChatHistory = async (onSuccess) => runDestructiveAction({
    actionId: 'chats',
    confirmMessage: 'Delete saved chat transcripts, revisions, and titles? Memories will be kept.',
    run: DesktopMemoryRuntimeClient.clearChatHistory,
    runArgs: [userId],
    requireActiveUser: true,
    successMessage: 'Chat history deleted.',
    onSuccess,
  });

  return {
    clearLocalMemory,
    clearChatHistory,
    pendingAction,
    status,
  };
}
