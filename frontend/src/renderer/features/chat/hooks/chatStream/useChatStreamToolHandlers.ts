import { useCallback } from 'react';
import {
  type ConversationEvent,
} from '../../../../infrastructure/api/windieSdkClient';

export function useChatStreamToolHandlers() {
  const handleToolCall = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    if (event.type !== 'tool_call') {
      return;
    }
    // Tool display state is owned by the SDK current-turn projection listener.
  }, []);

  const handleToolOutput = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
      return;
    }
    // Tool display state is owned by the SDK current-turn projection listener.
  }, []);

  const handleToolBundle = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    if (event.type !== 'tool_bundle_call') {
      return;
    }
    // Tool display state is owned by the SDK current-turn projection listener.
  }, []);

  return {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
  };
}
