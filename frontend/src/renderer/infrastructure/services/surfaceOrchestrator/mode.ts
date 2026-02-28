import type { SurfaceMode } from './types';

const INTERACTIVE_COMPUTER_TOOL_NAMES = new Set([
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'click',
  'type',
  'scroll',
]);

const CAPTURE_ONLY_COMPUTER_TOOL_NAMES = new Set(['screenshot', 'switch_tab', 'wait']);

function normalizeActionName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

export function resolveToolSurfaceMode(
  toolName: string,
  _args: Record<string, unknown> | undefined,
): SurfaceMode {
  const normalizedToolName = normalizeActionName(toolName);
  if (!normalizedToolName) {
    return 'none';
  }
  if (CAPTURE_ONLY_COMPUTER_TOOL_NAMES.has(normalizedToolName)) {
    return 'screenshot';
  }
  if (INTERACTIVE_COMPUTER_TOOL_NAMES.has(normalizedToolName)) {
    return 'interactive';
  }
  if (normalizedToolName !== 'browser') {
    return 'none';
  }
  return 'none';
}

export function resolveBundleSurfaceMode(
  tools: Array<{ toolName: string; args: Record<string, unknown> }>,
): SurfaceMode {
  let hasScreenshot = false;
  for (const tool of tools) {
    const mode = resolveToolSurfaceMode(tool.toolName, tool.args);
    if (mode === 'interactive') {
      return 'interactive';
    }
    if (mode === 'screenshot') {
      hasScreenshot = true;
    }
  }
  return hasScreenshot ? 'screenshot' : 'none';
}

export function shouldSkipToolExecution(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return metadata.skip_frontend_execution === true;
}

export function resolveToolRequestIdForCancellation(
  payload: Record<string, unknown> | undefined,
): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  if (typeof payload.request_id === 'string') {
    const requestId = payload.request_id.trim();
    if (requestId.length > 0) {
      return requestId;
    }
  }
  if (typeof payload.correlation_id === 'string') {
    const correlationId = payload.correlation_id.trim();
    if (correlationId.length > 0) {
      return correlationId;
    }
  }
  return null;
}
