import type { SystemState, ToolResult } from '../MessageFormatter';

type ToolResultPayloadOptions = {
  screenshot?: string | null;
  screenshotRef?: string | null;
  systemState?: SystemState | null;
  includeScreenshot?: boolean;
  includeSystemState?: boolean;
};

type RequiredSystemState = {
  active_window: string;
  mouse_position: string;
};

type InternalSystemState = RequiredSystemState & {
  screen_resolution?: string;
};

function sanitizeCaptureMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const { screenshot_id: _ignoredScreenshotId, ...rest } = value as Record<string, unknown>;
  return rest;
}

function pickSystemStateCandidate(
  preferred: SystemState | null | undefined,
  fallback: unknown,
): Record<string, unknown> {
  if (preferred && typeof preferred === 'object') {
    return preferred as Record<string, unknown>;
  }
  if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
    return fallback as Record<string, unknown>;
  }
  return {};
}

function asRequiredSystemState(
  preferred: SystemState | null | undefined,
  fallback: unknown,
): RequiredSystemState {
  const candidate = pickSystemStateCandidate(preferred, fallback);
  const activeWindowValue = candidate['active_window'];
  const activeWindowCamelValue = candidate['activeWindow'];
  const mousePositionValue = candidate['mouse_position'];
  const mousePositionCamelValue = candidate['mousePosition'];
  const activeWindow =
    typeof activeWindowValue === 'string' && activeWindowValue.length > 0
      ? activeWindowValue
      : typeof activeWindowCamelValue === 'string' && activeWindowCamelValue.length > 0
        ? activeWindowCamelValue
        : 'Unknown';
  const mousePosition =
    typeof mousePositionValue === 'string' && mousePositionValue.length > 0
      ? mousePositionValue
      : typeof mousePositionCamelValue === 'string' && mousePositionCamelValue.length > 0
        ? mousePositionCamelValue
        : 'Unknown';

  return {
    active_window: activeWindow,
    mouse_position: mousePosition,
  };
}

function asInternalSystemState(
  preferred: SystemState | null | undefined,
  fallback: unknown,
): InternalSystemState {
  const candidate = pickSystemStateCandidate(preferred, fallback);
  const modelState = asRequiredSystemState(preferred, fallback);
  const screenResolutionValue = candidate['screen_resolution'];
  const screenResolutionCamelValue = candidate['screenResolution'];
  const screenResolution =
    typeof screenResolutionValue === 'string' && screenResolutionValue.length > 0
      ? screenResolutionValue
      : typeof screenResolutionCamelValue === 'string' && screenResolutionCamelValue.length > 0
        ? screenResolutionCamelValue
        : null;
  return screenResolution
    ? { ...modelState, screen_resolution: screenResolution }
    : modelState;
}

export function buildToolResultPayloadData(
  result: ToolResult,
  formattedMessage: string,
  options: ToolResultPayloadOptions = {},
): Record<string, unknown> {
  const rawData =
    result.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const {
    screenshot: _screenshot,
    image_data: _imageData,
    screenshot_ref: rawScreenshotRef,
    screenshot_id: _rawScreenshotId,
    capture_meta: rawCaptureMeta,
    system_state: rawSystemState,
    ...payloadData
  } = rawData;

  const normalizedPayload: Record<string, unknown> = {
    ...payloadData,
    llm_content: formattedMessage,
  };

  if (options.includeSystemState) {
    const modelState = asRequiredSystemState(options.systemState, rawSystemState);
    const internalState = asInternalSystemState(options.systemState, rawSystemState);
    normalizedPayload.system_state = modelState;
    if (internalState.screen_resolution) {
      // Preserve runtime screen diagnostics for backend observability.
      normalizedPayload.system_state_internal = internalState;
    }
  }

  if (options.includeScreenshot) {
    const selectedScreenshotRef =
      options.screenshotRef ||
      (typeof rawScreenshotRef === 'string' && rawScreenshotRef.length > 0
        ? rawScreenshotRef
        : null);
    const selectedInlineScreenshot = (
      typeof options.screenshot === 'string' && options.screenshot.length > 0
        ? options.screenshot
        : (
          typeof _screenshot === 'string' && _screenshot.length > 0
            ? _screenshot
            : (
              typeof _imageData === 'string' && _imageData.length > 0
                ? _imageData
                : null
            )
        )
    );
    if (selectedScreenshotRef) {
      normalizedPayload.screenshot_ref = selectedScreenshotRef;
    } else if (selectedInlineScreenshot) {
      normalizedPayload.screenshot = selectedInlineScreenshot;
    }
    const captureMeta = sanitizeCaptureMeta(rawCaptureMeta);
    if (captureMeta) {
      normalizedPayload.capture_meta = captureMeta;
    }
  }

  return normalizedPayload;
}
