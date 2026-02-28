import type { SurfaceMode } from './types';
import { resolveCorrelationId } from '../CorrelationId';
import {
  CAPTURE_ONLY_COMPUTER_USE_TOOLS,
  INTERACTIVE_COMPUTER_USE_TOOLS,
} from '../ToolComputerUseCatalog';

const INTERACTIVE_COMPUTER_TOOL_NAMES = new Set(INTERACTIVE_COMPUTER_USE_TOOLS);
const CAPTURE_ONLY_COMPUTER_TOOL_NAMES = new Set(CAPTURE_ONLY_COMPUTER_USE_TOOLS);

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
  return resolveCorrelationId(payload.request_id, payload.correlation_id);
}
