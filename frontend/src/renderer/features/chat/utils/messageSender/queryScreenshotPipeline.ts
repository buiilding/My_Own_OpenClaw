import {
  buildScreenshotRefs,
  captureScreenshotAttachment,
  createInlineScreenshotAttachment,
  materializeScreenshotAttachments,
  resolvePrimaryScreenshotAttachment,
  type CaptureMeta,
  type ScreenshotAttachment,
} from '../../../../infrastructure/services/ScreenshotAttachmentPipeline';
import {
  normalizeArtifactImageContentType,
} from '../../../../infrastructure/services/ArtifactImageUtils';
import type { ClipboardImagePayload } from './chatMessageSenderPayloads';
import { logRendererChatPillTrace } from '../chatStream/chatStreamDebugTrace';

type UploadedScreenshotEntry = {
  screenshot: string;
  screenshotContentType: string | null;
  screenshotRef: string | null;
  screenshotUrl: string | null;
};

type QueryScreenshotArtifacts = {
  captureMeta: CaptureMeta | null;
  uploadedScreenshotEntries: UploadedScreenshotEntry[];
  screenshotRef: string | null;
  screenshotUrl: string | null;
  screenshotRefs: string[];
};

async function resolveAutoCapturedAttachment(
  shouldCaptureQueryScreenshot: boolean,
  isFirstUserMessage: boolean,
): Promise<ScreenshotAttachment> {
  if (!shouldCaptureQueryScreenshot) {
    return createInlineScreenshotAttachment({
      screenshot: '',
      screenshotContentType: null,
    });
  }

  try {
    return await captureScreenshotAttachment({
      waitSeconds: 0,
      isFirstUserMessage,
    });
  } catch (error) {
    console.error('[queryScreenshotPipeline] Failed to capture screenshot attachment:', error);
    return createInlineScreenshotAttachment({
      screenshot: '',
      screenshotContentType: null,
    });
  }
}

function buildUploadedScreenshotEntries(
  attachments: ScreenshotAttachment[],
): UploadedScreenshotEntry[] {
  return attachments
    .filter((attachment) => Boolean(attachment.screenshot))
    .map((attachment) => ({
      screenshot: attachment.screenshot || '',
      screenshotContentType: normalizeArtifactImageContentType(attachment.screenshotContentType),
      screenshotRef: attachment.screenshotRef,
      screenshotUrl: attachment.screenshotUrl,
    }));
}

export async function resolveQueryScreenshotArtifacts({
  clipboardImages,
  shouldCaptureQueryScreenshot,
  isFirstUserMessage,
  traceContext = null,
}: {
  clipboardImages: ClipboardImagePayload[];
  shouldCaptureQueryScreenshot: boolean;
  isFirstUserMessage: boolean;
  traceContext?: {
    conversationRef?: string | null;
    turnId?: string | null;
    surfaceReason?: string | null;
  } | null;
}): Promise<QueryScreenshotArtifacts> {
  logRendererChatPillTrace({
    source: 'renderer-send',
    action: 'screenshot-decision',
    turn_id: traceContext?.turnId || null,
    include_query_screenshot: shouldCaptureQueryScreenshot,
    reason: traceContext?.surfaceReason || null,
  }, traceContext?.conversationRef || null);

  const firstClipboardImage = clipboardImages[0] || null;
  const autoCapturedAttachment = firstClipboardImage
    ? createInlineScreenshotAttachment({
      screenshot: '',
      screenshotContentType: null,
    })
    : await resolveAutoCapturedAttachment(shouldCaptureQueryScreenshot, isFirstUserMessage);
  const sourceAttachments = clipboardImages.length > 0
    ? clipboardImages.map((clipboardImage) => createInlineScreenshotAttachment({
        screenshot: clipboardImage.base64,
        screenshotContentType: clipboardImage.contentType,
      }))
    : (autoCapturedAttachment.screenshot || autoCapturedAttachment.screenshotRef || autoCapturedAttachment.screenshotUrl
        ? [autoCapturedAttachment]
        : []);

  const materializedAttachments = await materializeScreenshotAttachments(
    sourceAttachments,
    (index) => {
      if (clipboardImages[index]?.filename) {
        return clipboardImages[index].filename.replace(/\.[^.]+$/, '');
      }
      return 'user-message';
    },
  );
  const uploadedScreenshotEntries = buildUploadedScreenshotEntries(materializedAttachments);
  const primaryAttachment = resolvePrimaryScreenshotAttachment(materializedAttachments);

  return {
    captureMeta: autoCapturedAttachment.captureMeta,
    uploadedScreenshotEntries,
    screenshotRef: primaryAttachment.screenshotRef,
    screenshotUrl: primaryAttachment.screenshotUrl,
    screenshotRefs: buildScreenshotRefs(materializedAttachments),
  };
}
