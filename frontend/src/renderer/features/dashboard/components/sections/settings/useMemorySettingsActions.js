import { useState } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import { useTranscriptSessionInfo } from '../../../hooks/useTranscriptSessionInfo';
import { DEFAULT_USER_ID } from '../../../utils/episodicMemoryUtils';

export function useMemorySettingsActions() {
  const sessionInfo = useTranscriptSessionInfo();
  const userId = sessionInfo.userId || DEFAULT_USER_ID;
  const [pendingAction, setPendingAction] = useState(null);
  const [status, setStatus] = useState({
    tone: 'idle',
    message: '',
  });

  const runDestructiveAction = async ({
    actionId,
    confirmMessage,
    channel,
    successMessage,
    onSuccess,
  }) => {
    if (pendingAction) {
      return false;
    }

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) {
      return false;
    }

    setPendingAction(actionId);
    setStatus({ tone: 'idle', message: '' });

    try {
      const result = await IpcBridge.invoke(channel, { userId });
      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to complete destructive action');
      }

      setStatus({
        tone: 'success',
        message: successMessage,
      });
      if (typeof onSuccess === 'function') {
        try {
          await onSuccess(result?.data);
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
    confirmMessage: 'Delete all local episodic and semantic memory? Past chats will be kept.',
    channel: INVOKE_CHANNELS.CLEAR_LOCAL_MEMORY,
    successMessage: 'Local episodic and semantic memory deleted.',
  });

  const clearChatHistory = async (onSuccess) => runDestructiveAction({
    actionId: 'chats',
    confirmMessage: 'Delete all past chats? Local episodic and semantic memory will be kept.',
    channel: INVOKE_CHANNELS.CLEAR_CHAT_HISTORY,
    successMessage: 'Past chats deleted.',
    onSuccess,
  });

  return {
    clearLocalMemory,
    clearChatHistory,
    pendingAction,
    status,
  };
}
