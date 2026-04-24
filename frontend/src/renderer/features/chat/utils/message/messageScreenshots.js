import { normalizeArtifactImageContentType } from '../../../../infrastructure/services/ArtifactImageUtils';
import { buildArtifactUrl } from '../../../../infrastructure/services/BackendEndpointStore';
import {
  inferArtifactRefFromUrl,
  resolveScreenshotAttachmentState,
} from '../../../../infrastructure/services/screenshotMessageState';
import { normalizeNonEmptyString } from '../../../../utils/normalizeNonEmptyString';

function resolveAttachmentSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (attachment.screenshotUrl) {
    return attachment.screenshotUrl;
  }
  if (attachment.screenshotRef) {
    return buildArtifactUrl(attachment.screenshotRef);
  }
  if (attachment.screenshot) {
    const contentType = normalizeArtifactImageContentType(attachment.screenshotContentType);
    return `data:${contentType};base64,${attachment.screenshot}`;
  }
  return null;
}

export function resolveStaticScreenshotAttachmentSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (attachment.screenshot) {
    return resolveAttachmentSrc(attachment);
  }
  const normalizedUrl = normalizeNonEmptyString(attachment.screenshotUrl);
  if (normalizedUrl && !inferArtifactRefFromUrl(normalizedUrl)) {
    return normalizedUrl;
  }
  return null;
}

export function resolveMessageScreenshotAttachments(message) {
  if (Array.isArray(message?.screenshots) && message.screenshots.length > 0) {
    return message.screenshots
      .map((attachment) => resolveScreenshotAttachmentState({
        screenshot: attachment?.screenshot ?? null,
        screenshotRef: attachment?.screenshotRef ?? null,
        screenshotUrl: attachment?.screenshotUrl ?? null,
        screenshotContentType: attachment?.screenshotContentType ?? null,
        preserveInlineScreenshotWithRemote: true,
      }))
      .filter((attachment) => (
        Boolean(attachment.screenshot)
        || Boolean(attachment.screenshotRef)
        || Boolean(attachment.screenshotUrl)
      ));
  }

  const fallbackAttachment = resolveScreenshotAttachmentState({
    screenshot: message?.screenshot ?? null,
    screenshotRef: message?.screenshotRef ?? null,
    screenshotUrl: message?.screenshotUrl ?? null,
    screenshotContentType: message?.screenshotContentType ?? null,
    preserveInlineScreenshotWithRemote: true,
  });

  if (
    fallbackAttachment.screenshot
    || fallbackAttachment.screenshotRef
    || fallbackAttachment.screenshotUrl
  ) {
    return [fallbackAttachment];
  }
  return [];
}

export function resolveMessageScreenshotSrcList(message) {
  const screenshotSources = resolveMessageScreenshotAttachments(message)
    .map((attachment) => resolveAttachmentSrc(attachment))
    .filter((src) => Boolean(src));

  if (screenshotSources.length > 0) {
    return screenshotSources;
  }
  return [];
}

export function hasMessageScreenshot(message) {
  return resolveMessageScreenshotSrcList(message).length > 0;
}

export function isUserMessageWithScreenshot(message) {
  return message?.sender === 'user' && hasMessageScreenshot(message);
}

export function resolveMessageScreenshotSrc(message) {
  return resolveMessageScreenshotSrcList(message)[0] || null;
}
