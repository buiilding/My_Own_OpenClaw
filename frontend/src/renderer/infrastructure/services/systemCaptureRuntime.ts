import { getStoredDisplayBounds } from '../../utils/displaySelection';
import type { SystemState, ToolResult } from './MessageFormatter';
import {
  resolveScreenshotContentType,
  sanitizeCaptureMeta,
} from './CapturePayloadUtils';

export type CaptureMeta = {
  source_w?: number;
  source_h?: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
  desktop_virtual_bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  monitor_id?: string | null;
  timestamp?: number;
};

export type ExtractOsStateResult = {
  systemState: SystemState | null;
  screenshot: string | null;
  screenshotRef: string | null;
  screenshotUrl: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
};

export function createEmptyExtractOsStateResult(): ExtractOsStateResult {
  return {
    systemState: null,
    screenshot: null,
    screenshotRef: null,
    screenshotUrl: null,
    screenshotContentType: null,
    captureMeta: null,
  };
}

export function buildScreenshotArgs(explanation: string) {
  const args: Record<string, any> = {
    explanation,
    expectation: 'Current screen state',
  };
  const displayBounds = getStoredDisplayBounds();
  if (displayBounds) {
    args.display_bounds = displayBounds;
  }
  return args;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function inferArtifactRefFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  const match = url.match(/\/api\/artifacts\/([^/?#]+)/i);
  return match?.[1] || null;
}

export function extractScreenshotData(result: ToolResult) {
  if (!result.success || !result.data || typeof result.data !== 'object') {
    return createEmptyExtractOsStateResult();
  }

  const screenshot = normalizeOptionalString(result.data.screenshot);
  const screenshotUrl = normalizeOptionalString(result.data.screenshot_url);
  const screenshotRef = (
    normalizeOptionalString(result.data.screenshot_ref)
    || inferArtifactRefFromUrl(screenshotUrl)
  );
  const captureMeta = sanitizeCaptureMeta<CaptureMeta>(result.data.capture_meta);
  const screenshotContentType = resolveScreenshotContentType(result.data);
  return {
    ...createEmptyExtractOsStateResult(),
    screenshot,
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
    captureMeta,
  };
}

export function buildExtractOsStateResult({
  systemState = null,
  screenshotData = createEmptyExtractOsStateResult(),
}: {
  systemState?: SystemState | null;
  screenshotData?: Partial<ExtractOsStateResult>;
}): ExtractOsStateResult {
  return {
    ...createEmptyExtractOsStateResult(),
    ...screenshotData,
    systemState,
  };
}
