/**
 * Provides renderer message screenshot attachment descriptors for presentation surfaces.
 */

import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import { normalizeNonEmptyString } from '../../utils/normalizeNonEmptyString';

function resolveAttachmentSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (attachment.screenshotUrl) {
    return attachment.screenshotUrl;
  }
  if (attachment.screenshotRef) {
    return DesktopArtifactRuntimeClient.buildArtifactUrl(attachment.screenshotRef);
  }
  if (attachment.screenshot) {
    const contentType = DesktopArtifactRuntimeClient.normalizeArtifactImageContentType(
      attachment.screenshotContentType,
    );
    return `data:${contentType};base64,${attachment.screenshot}`;
  }
  return null;
}

function resolveStaticScreenshotAttachmentSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  if (attachment.screenshot) {
    return resolveAttachmentSrc(attachment);
  }
  const normalizedUrl = normalizeNonEmptyString(attachment.screenshotUrl);
  if (normalizedUrl && !DesktopArtifactRuntimeClient.inferArtifactRefFromUrl(normalizedUrl)) {
    return normalizedUrl;
  }
  return null;
}

function resolveMessageScreenshotAttachments(message) {
  if (Array.isArray(message?.screenshots) && message.screenshots.length > 0) {
    return message.screenshots
      .map((attachment) => DesktopArtifactRuntimeClient.resolveScreenshotAttachmentState({
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

  const fallbackAttachment = DesktopArtifactRuntimeClient.resolveScreenshotAttachmentState({
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

function hasMessageScreenshot(message) {
  return resolveMessageScreenshotAttachments(message).length > 0;
}

function isUserMessageWithScreenshot(message) {
  return message?.sender === 'user' && hasMessageScreenshot(message);
}

export const DesktopMessageScreenshotRuntime = Object.freeze({
  hasMessageScreenshot,
  isUserMessageWithScreenshot,
  resolveMessageScreenshotAttachments,
  resolveStaticScreenshotAttachmentSrc,
});
