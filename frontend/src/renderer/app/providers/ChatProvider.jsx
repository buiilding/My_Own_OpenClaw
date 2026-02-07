import { useChatStream } from '../../features/chat/hooks/useChatStream';
import { useToolRunner } from '../../features/chat/hooks/useToolRunner';
import { ChatContext } from './ChatContext';

/**
 * ChatProvider - Thin wrapper that sets up chat hooks and provides store access.
 * No business logic - just composition.
 */
export function ChatProvider({ children, enableToolRunner = true, enableTranscript = true }) {
  useChatStream(enableTranscript);
  useToolRunner(enableToolRunner);

  return (
    <ChatContext.Provider value={null}>
      {children}
    </ChatContext.Provider>
  );
}
