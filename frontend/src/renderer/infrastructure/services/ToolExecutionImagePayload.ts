import type { ToolResult } from './MessageFormatter';

type ExtractedToolResultImage = {
  base64: string;
  contentType: string | null;
};

type ExtractedToolResultScreenshotRef = {
  screenshotRef: string | null;
  screenshotUrl: string | null;
};

function asToolResultData(
  data: ToolResult['data'],
): Record<string, unknown> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

export function parseImagePayload(payload: string): ExtractedToolResultImage | null {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return null;
  }
  if (
    trimmedPayload.toLowerCase().startsWith('artifact://')
    || trimmedPayload.toLowerCase().startsWith('http://')
    || trimmedPayload.toLowerCase().startsWith('https://')
  ) {
    return null;
  }

  const dataUrlMatch = trimmedPayload.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      contentType: dataUrlMatch[1].toLowerCase(),
      base64: dataUrlMatch[2].trim(),
    };
  }

  return {
    base64: trimmedPayload,
    contentType: null,
  };
}

export function extractToolResultImage(result: ToolResult): ExtractedToolResultImage | null {
  const data = asToolResultData(result.data);
  if (!data) {
    return null;
  }

  const rawScreenshot = (
    typeof data.screenshot === 'string' && data.screenshot.trim().length > 0
      ? data.screenshot
      : (
        typeof data.image_data === 'string' && data.image_data.trim().length > 0
          ? data.image_data
          : null
      )
  );
  if (!rawScreenshot) {
    return null;
  }

  const parsedPayload = parseImagePayload(rawScreenshot);
  if (!parsedPayload) {
    return null;
  }

  const explicitContentType = (
    typeof data.screenshot_content_type === 'string' && data.screenshot_content_type.trim().length > 0
      ? data.screenshot_content_type.trim().toLowerCase()
      : (
        typeof data.image_content_type === 'string' && data.image_content_type.trim().length > 0
          ? data.image_content_type.trim().toLowerCase()
          : null
      )
  );
  const selectedContentType = explicitContentType && explicitContentType.startsWith('image/')
    ? explicitContentType
    : parsedPayload.contentType;

  return {
    base64: parsedPayload.base64,
    contentType: selectedContentType,
  };
}

export function extractToolResultScreenshotRef(
  result: ToolResult,
): ExtractedToolResultScreenshotRef | null {
  const data = asToolResultData(result.data);
  if (!data) {
    return null;
  }
  const screenshotRef = (
    typeof data.screenshot_ref === 'string' && data.screenshot_ref.trim().length > 0
      ? data.screenshot_ref.trim()
      : null
  );
  const screenshotUrl = (
    typeof data.screenshot_url === 'string' && data.screenshot_url.trim().length > 0
      ? data.screenshot_url.trim()
      : null
  );
  if (!screenshotRef && !screenshotUrl) {
    return null;
  }
  return { screenshotRef, screenshotUrl };
}
