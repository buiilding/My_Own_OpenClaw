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

export function toScreenshotAttachments(uploadedArtifacts: Array<UploadedArtifact | null | undefined>) {
  const normalized = uploadedArtifacts
    .map((uploaded) => toScreenshotAttachment(uploaded))
    .filter((attachment) => attachment.screenshotRef || attachment.screenshotUrl);

  return {
    screenshotRefs: normalized
      .map((attachment) => attachment.screenshotRef)
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0),
    screenshotUrls: normalized
      .map((attachment) => attachment.screenshotUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0),
  };
}
