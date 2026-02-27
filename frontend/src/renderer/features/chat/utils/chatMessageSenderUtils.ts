import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../../infrastructure/services/ArtifactImageUtils';
import type { ChatMessage } from '../stores/chatStore';

type UploadedArtifact = {
  artifactId?: string | null;
  url?: string | null;
};

export function hasUserMessages(messages: Pick<ChatMessage, 'sender'>[]): boolean {
  return messages.some((message) => message.sender === 'user');
}

export function buildPendingUserMessage(id: string, text: string): ChatMessage {
  return {
    id,
    text,
    sender: 'user',
    screenshot: null,
  };
}

export function buildArtifactUploadMeta(screenshotContentType: string | null | undefined) {
  const contentType = normalizeArtifactImageContentType(screenshotContentType);
  const extension = resolveArtifactImageExtension(contentType);
  return {
    contentType,
    filename: `user-message.${extension}`,
  };
}

export function toScreenshotAttachment(uploaded: UploadedArtifact | null | undefined) {
  return {
    screenshotRef: uploaded?.artifactId || null,
    screenshotUrl: uploaded?.url || null,
  };
}
