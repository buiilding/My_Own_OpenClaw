import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';

const INTERACTIVE_COMPUTER_TOOL_NAMES = new Set([
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'click',
  'type',
  'scroll',
]);
const SCREENSHOT_TOOL_NAMES = new Set(['screenshot']);
const INTERACTIVE_BROWSER_ACTIONS = new Set(['click', 'type', 'scroll']);
const SCREENSHOT_BROWSER_ACTIONS = new Set(['screenshot']);
const EXCLUDED_COMPUTER_ACTION_NAMES = new Set(['switch_tab']);
const TOOL_FOCUS_PREPARE_WAIT_MS = 180;

export type ToolSurfaceMode = 'none' | 'interactive' | 'screenshot';

export type ToolSurfacePreparation = {
  restoreChatPillAfterExecution: boolean;
  canExecute: boolean;
  failureReason: string | null;
};

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
  if (typeof payload.request_id === 'string' && payload.request_id.length > 0) {
    return payload.request_id;
  }
  if (typeof payload.correlation_id === 'string' && payload.correlation_id.length > 0) {
    return payload.correlation_id;
  }
  return null;
}

function normalizeActionName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

export function resolveToolSurfaceMode(
  toolName: string,
  args: Record<string, unknown> | undefined,
): ToolSurfaceMode {
  const normalizedToolName = normalizeActionName(toolName);
  if (!normalizedToolName || EXCLUDED_COMPUTER_ACTION_NAMES.has(normalizedToolName)) {
    return 'none';
  }
  if (SCREENSHOT_TOOL_NAMES.has(normalizedToolName)) {
    return 'screenshot';
  }
  if (INTERACTIVE_COMPUTER_TOOL_NAMES.has(normalizedToolName)) {
    return 'interactive';
  }
  if (normalizedToolName !== 'browser') {
    return 'none';
  }
  const normalizedAction = normalizeActionName(args?.action);
  if (!normalizedAction || EXCLUDED_COMPUTER_ACTION_NAMES.has(normalizedAction)) {
    return 'none';
  }
  if (SCREENSHOT_BROWSER_ACTIONS.has(normalizedAction)) {
    return 'screenshot';
  }
  if (INTERACTIVE_BROWSER_ACTIONS.has(normalizedAction)) {
    return 'interactive';
  }
  return 'none';
}

export function resolveBundleSurfaceMode(
  tools: Array<{ toolName: string; args: Record<string, unknown> }>,
): ToolSurfaceMode {
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

export async function prepareToolExecutionSurface(
  mode: ToolSurfaceMode,
): Promise<ToolSurfacePreparation> {
  if (mode === 'none') {
    return {
      restoreChatPillAfterExecution: false,
      canExecute: true,
      failureReason: null,
    };
  }
  let restoreChatPillAfterExecution = false;
  try {
    if (mode === 'interactive') {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
      await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
      restoreChatPillAfterExecution = true;
      const focusPreparation = await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
        waitMs: TOOL_FOCUS_PREPARE_WAIT_MS,
      });
      const canVerifyExternalFocus = focusPreparation?.data?.canVerifyExternalFocus === true;
      const externalFocusActive = focusPreparation?.data?.externalFocusActive === true;
      if (focusPreparation?.success === false) {
        return {
          restoreChatPillAfterExecution,
          canExecute: false,
          failureReason: typeof focusPreparation?.reason === 'string'
            ? focusPreparation.reason
            : 'overlay_focus_prepare_failed',
        };
      }
      if (canVerifyExternalFocus && !externalFocusActive) {
        return {
          restoreChatPillAfterExecution,
          canExecute: false,
          failureReason: 'external_window_focus_not_verified',
        };
      }
      return {
        restoreChatPillAfterExecution,
        canExecute: true,
        failureReason: null,
      };
    }
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    return {
      restoreChatPillAfterExecution: true,
      canExecute: true,
      failureReason: null,
    };
  } catch (error) {
    console.warn('[useToolRunner] Failed to prepare tool execution surface:', error);
    return {
      restoreChatPillAfterExecution,
      canExecute: false,
      failureReason: 'overlay_surface_prepare_exception',
    };
  }
}

export async function restoreToolExecutionSurface(
  preparation: ToolSurfacePreparation,
): Promise<void> {
  if (!preparation.restoreChatPillAfterExecution) {
    return;
  }
  try {
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
  } catch (error) {
    console.warn('[useToolRunner] Failed to restore chat pill after tool execution:', error);
  }
}

export async function ensureToolExecutionSurface(
  toolName: string,
  args: Record<string, unknown> | undefined,
): Promise<ToolSurfacePreparation> {
  const mode = resolveToolSurfaceMode(toolName, args);
  return prepareToolExecutionSurface(mode);
}

