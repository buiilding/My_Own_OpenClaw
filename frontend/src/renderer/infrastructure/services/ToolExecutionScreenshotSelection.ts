import type { ToolResult } from './MessageFormatter';
import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from './ArtifactImageUtils';
import {
  extractToolResultImage,
  extractToolResultScreenshotRef,
  parseImagePayload,
} from './ToolExecutionImagePayload';

type ToolExecutionScreenshotSelection = {
  screenshot: string | null;
  screenshotContentType: string | null;
  preUploadedScreenshot: { screenshotRef: string; screenshotUrl: string | null } | null;
  uploadFilename: string | null;
  uploadContentType: string;
};

export function resolveToolExecutionScreenshotSelection(
  toolName: string,
  captureScreenshot: string | null | undefined,
  captureScreenshotContentType: string | null | undefined,
  result: ToolResult,
): ToolExecutionScreenshotSelection {
  const captureImage = (
    typeof captureScreenshot === 'string' && captureScreenshot.length > 0
      ? parseImagePayload(captureScreenshot)
      : null
  );
  const toolResultImage = extractToolResultImage(result);
  const preUploadedScreenshot = extractToolResultScreenshotRef(result);
  const selectedImage = captureImage || toolResultImage;
  const screenshot = selectedImage?.base64 || null;
  const screenshotContentType = (
    captureScreenshotContentType
    || selectedImage?.contentType
    || null
  );

  return {
    screenshot,
    screenshotContentType,
    preUploadedScreenshot,
    uploadFilename: screenshot
      ? `${toolName}-screenshot.${resolveArtifactImageExtension(screenshotContentType)}`
      : null,
    uploadContentType: normalizeArtifactImageContentType(screenshotContentType),
  };
}
