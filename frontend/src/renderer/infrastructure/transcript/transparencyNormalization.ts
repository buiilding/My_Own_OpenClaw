import { normalizeOptionalIncomingText } from '../text/incomingTextNormalization';
import type { TranscriptTransparencyData } from './types';

const normalizeOptionalString = (value: unknown): string | null => {
  return normalizeOptionalIncomingText(value);
};

export const normalizeTransparencyData = (
  transparency: TranscriptTransparencyData | null | undefined,
): TranscriptTransparencyData | null => {
  if (!transparency || typeof transparency !== 'object') {
    return null;
  }

  const normalized: TranscriptTransparencyData = {};
  const systemPrompt = normalizeOptionalString(transparency.systemPrompt);
  if (systemPrompt) {
    normalized.systemPrompt = systemPrompt;
  }

  if (Array.isArray(transparency.toolSchemas) && transparency.toolSchemas.length > 0) {
    normalized.toolSchemas = [...transparency.toolSchemas];
  }

  const fullUserContent = normalizeOptionalString(transparency.fullUserMessage?.content);
  const fullUserMetadata = (
    transparency.fullUserMessage?.metadata
    && typeof transparency.fullUserMessage.metadata === 'object'
    && !Array.isArray(transparency.fullUserMessage.metadata)
  )
    ? { ...transparency.fullUserMessage.metadata }
    : null;
  if (fullUserContent || fullUserMetadata) {
    normalized.fullUserMessage = {
      content: fullUserContent || undefined,
      metadata: fullUserMetadata || undefined,
    };
  }

  const fullAssistantContent = normalizeOptionalString(transparency.fullAssistantMessage?.content);
  if (fullAssistantContent) {
    normalized.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
};
