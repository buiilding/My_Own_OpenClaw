import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';

const INTERACTIVE_COMPUTER_TOOL_NAMES = new Set([
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'click',
  'type',
  'scroll',
]);
const CAPTURE_ONLY_COMPUTER_TOOL_NAMES = new Set(['screenshot', 'switch_tab', 'wait']);
const TOOL_FOCUS_PREPARE_WAIT_MS = 180;
const TOOL_FOCUS_PREPARE_MAX_ATTEMPTS = 5;
const OVERLAY_SURFACE_PREPARE_EXCEPTION = 'overlay_surface_prepare_exception';

type ToolSurfaceMode = 'none' | 'interactive' | 'screenshot';

type ToolSurfacePreparation = {
  restoreChatPillAfterExecution: boolean;
  canExecute: boolean;
  failureReason: string | null;
  surfaceToken: number | null;
  overlayIgnoreEnabled: boolean;
};

let nextSurfaceToken = 1;
const activeSurfaceTokens = new Set<number>();
const activeOverlayIgnoreTokens = new Set<number>();

function registerSurfaceToken(): number {
  const token = nextSurfaceToken;
  nextSurfaceToken += 1;
  activeSurfaceTokens.add(token);
  return token;
}

function releaseSurfaceToken(surfaceToken: number | null): boolean {
  if (typeof surfaceToken !== 'number') {
    return false;
  }
  if (!activeSurfaceTokens.has(surfaceToken)) {
    return false;
  }
  activeSurfaceTokens.delete(surfaceToken);
  return activeSurfaceTokens.size === 0;
}

function markOverlayIgnoreForToken(surfaceToken: number | null): void {
  if (typeof surfaceToken !== 'number') {
    return;
  }
  activeOverlayIgnoreTokens.add(surfaceToken);
}

function unmarkOverlayIgnoreForToken(surfaceToken: number | null): boolean {
  if (typeof surfaceToken !== 'number') {
    return false;
  }
  if (!activeOverlayIgnoreTokens.has(surfaceToken)) {
    return false;
  }
  activeOverlayIgnoreTokens.delete(surfaceToken);
  return activeOverlayIgnoreTokens.size === 0;
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

function resolveToolSurfaceMode(
  toolName: string,
  _args: Record<string, unknown> | undefined,
): ToolSurfaceMode {
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
  // Browser Use actions execute in the browser runtime and should not
  // trigger dashboard/chat-pill surface transitions.
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
      surfaceToken: null,
      overlayIgnoreEnabled: false,
    };
  }
  let surfaceToken: number | null = null;
  let overlayIgnoreEnabled = false;
  const surfaceAlreadyPrepared = activeSurfaceTokens.size > 0;
  try {
    if (!surfaceAlreadyPrepared) {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
      await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    }
    surfaceToken = registerSurfaceToken();

    if (mode === 'interactive') {
      try {
        const ignoreResult = await IpcBridge.invoke(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, {
          ignore: true,
        });
        overlayIgnoreEnabled = ignoreResult?.success !== false;
        if (overlayIgnoreEnabled) {
          markOverlayIgnoreForToken(surfaceToken);
        }
      } catch (error) {
        console.warn('[useToolRunner] Failed to enable overlay click-through for tool execution:', error);
      }
      for (let attempt = 1; attempt <= TOOL_FOCUS_PREPARE_MAX_ATTEMPTS; attempt += 1) {
        const focusPreparation = await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
          waitMs: TOOL_FOCUS_PREPARE_WAIT_MS,
        });
        const canVerifyExternalFocus = focusPreparation?.data?.canVerifyExternalFocus === true;
        const externalFocusActive = focusPreparation?.data?.externalFocusActive === true;

        if (focusPreparation?.success === false) {
          return {
            restoreChatPillAfterExecution: true,
            canExecute: false,
            failureReason: typeof focusPreparation?.reason === 'string'
              ? focusPreparation.reason
              : 'overlay_focus_prepare_failed',
            surfaceToken,
            overlayIgnoreEnabled,
          };
        }

        if (!canVerifyExternalFocus || externalFocusActive) {
          return {
            restoreChatPillAfterExecution: true,
            canExecute: true,
            failureReason: null,
            surfaceToken,
            overlayIgnoreEnabled,
          };
        }
      }

      return {
        restoreChatPillAfterExecution: true,
        canExecute: false,
        failureReason: 'external_window_focus_not_verified',
        surfaceToken,
        overlayIgnoreEnabled,
      };
    }
    return {
      restoreChatPillAfterExecution: true,
      canExecute: true,
      failureReason: null,
      surfaceToken,
      overlayIgnoreEnabled,
    };
  } catch (error) {
    console.warn('[useToolRunner] Failed to prepare tool execution surface:', error);
    return {
      restoreChatPillAfterExecution: surfaceToken !== null,
      canExecute: false,
      failureReason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
      surfaceToken,
      overlayIgnoreEnabled,
    };
  }
}

export async function restoreToolExecutionSurface(
  preparation: ToolSurfacePreparation,
): Promise<void> {
  if (preparation.overlayIgnoreEnabled && unmarkOverlayIgnoreForToken(preparation.surfaceToken)) {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, { ignore: false });
    } catch (error) {
      console.warn('[useToolRunner] Failed to disable overlay click-through after tool execution:', error);
    }
  }
  if (!preparation.restoreChatPillAfterExecution || typeof preparation.surfaceToken !== 'number') {
    return;
  }
  const shouldRestoreChatPill = releaseSurfaceToken(preparation.surfaceToken);
  if (!shouldRestoreChatPill) {
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

export function __resetToolExecutionSurfaceStateForTests(): void {
  activeSurfaceTokens.clear();
  activeOverlayIgnoreTokens.clear();
  nextSurfaceToken = 1;
}
