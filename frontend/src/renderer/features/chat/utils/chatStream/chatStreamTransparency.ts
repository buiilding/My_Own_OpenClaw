import type { ChatMessage } from '../../stores/chatStore';
import type { TranscriptTransparencyData } from '../../../../infrastructure/transcript/types';
import { normalizeToolSchemaList } from '../../../../infrastructure/transcript/toolSchemaShape';

function resolveUserMessageForTurn(
  messages: ChatMessage[],
  turnRef?: string,
): ChatMessage | null {
  const reverseMessages = messages.slice().reverse();
  if (turnRef) {
    return reverseMessages.find((message) => (
      message.sender === 'user'
      && message.turnRef === turnRef
    )) || null;
  }
  return (
    reverseMessages.find((message) => message.sender === 'user')
    || null
  );
}

export function buildAssistantTranscriptTransparency(
  messages: ChatMessage[],
  assistantMessage: ChatMessage,
  turnRef?: string,
): TranscriptTransparencyData | undefined {
  const userMessageForTurn = resolveUserMessageForTurn(messages, turnRef);
  const transparency: TranscriptTransparencyData = {};

  const systemPromptContent = (
    typeof userMessageForTurn?.systemPrompt?.content === 'string'
      ? userMessageForTurn.systemPrompt.content.trim()
      : ''
  );
  if (systemPromptContent) {
    transparency.systemPrompt = systemPromptContent;
  }

  const toolSchemas = (
    Array.isArray(userMessageForTurn?.toolSchemas)
      ? userMessageForTurn.toolSchemas
      : Array.isArray(userMessageForTurn?.systemPrompt?.toolSchemas)
        ? userMessageForTurn.systemPrompt.toolSchemas
        : null
  );
  const normalizedToolSchemas = normalizeToolSchemaList(toolSchemas);
  if (normalizedToolSchemas && normalizedToolSchemas.length > 0) {
    transparency.toolSchemas = normalizedToolSchemas;
  }

  const fullUserContent = (
    typeof userMessageForTurn?.fullUserMessage?.content === 'string'
      ? userMessageForTurn.fullUserMessage.content.trim()
      : ''
  );
  const fullUserMetadata = (
    userMessageForTurn?.fullUserMessage?.metadata
    && typeof userMessageForTurn.fullUserMessage.metadata === 'object'
    && !Array.isArray(userMessageForTurn.fullUserMessage.metadata)
  )
    ? userMessageForTurn.fullUserMessage.metadata as Record<string, unknown>
    : null;
  if (fullUserContent || fullUserMetadata) {
    transparency.fullUserMessage = {
      content: fullUserContent || undefined,
      metadata: fullUserMetadata || undefined,
    };
  }

  // Full assistant payload can be very large and often includes chain artifacts.
  // Persisting only trimmed content keeps transcript metadata useful without noise.
  const fullAssistantContent = (
    typeof assistantMessage.fullAssistantMessage?.content === 'string'
      ? assistantMessage.fullAssistantMessage.content.trim()
      : ''
  );
  if (fullAssistantContent) {
    transparency.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return Object.keys(transparency).length > 0
    ? transparency
    : undefined;
}
