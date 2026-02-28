import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

const INTERACTIVE_COMPUTER_TOOL_NAMES = new Set([
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'click',
  'type',
  'scroll',
]);

const CAPTURE_ONLY_COMPUTER_TOOL_NAMES = new Set(['screenshot', 'switch_tab', 'wait']);

const DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS = 180;
const DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS = 5;
const DEFAULT_CAPTURE_FOCUS_PREPARE_WAIT_MS = 120;
const OVERLAY_SURFACE_PREPARE_EXCEPTION = 'overlay_surface_prepare_exception';

export type SurfaceMode = 'none' | 'interactive' | 'screenshot';

export type SurfacePhase =
  | 'idle'
  | 'preparing_interactive_focus'
  | 'interactive_ready'
  | 'preparing_capture_visibility'
  | 'capture_ready'
  | 'restoring_surface'
  | 'failed_terminal';

export type SurfaceTransitionSource = 'tool-runner' | 'system-capture';

export type ToolSurfacePreparation = {
  restoreChatPillAfterExecution: boolean;
  canExecute: boolean;
  failureReason: string | null;
  surfaceToken: number | null;
  overlayIgnoreEnabled: boolean;
  mode: SurfaceMode;
  correlationId: string;
};

export type CaptureVisibilityPreparation = {
  prepared: boolean;
  captureId: string;
};

let nextSurfaceToken = 1;
const activeSurfaceTokens = new Set<number>();
const activeOverlayIgnoreTokens = new Set<number>();
let pendingChatPillRestore = false;
let activeScreenshotCaptureCount = 0;
let pendingScreenshotCaptureRestore = false;
let transitionLogSequence = 0;
let nextSyntheticCorrelationId = 1;

function resolveCorrelationId(correlationId: string | null | undefined, fallbackPrefix: string): string {
  if (typeof correlationId === 'string' && correlationId.trim().length > 0) {
    return correlationId.trim();
  }
  const syntheticCorrelationId = `${fallbackPrefix}-${nextSyntheticCorrelationId}`;
  nextSyntheticCorrelationId += 1;
  return syntheticCorrelationId;
}

function shouldLogSurfaceTransitions(): boolean {
  const globalWindow = typeof window !== 'undefined' ? (window as Window & {
    __WINDIE_VERBOSE_TOOL_LOGS__?: boolean;
  }) : null;
  if (globalWindow && typeof globalWindow.__WINDIE_VERBOSE_TOOL_LOGS__ === 'boolean') {
    return globalWindow.__WINDIE_VERBOSE_TOOL_LOGS__;
  }
  return !(
    typeof process !== 'undefined'
    && process.env
    && process.env.NODE_ENV === 'production'
  );
}

function logSurfaceTransition(options: {
  source: SurfaceTransitionSource;
  correlationId: string;
  mode: SurfaceMode;
  phaseBefore: SurfacePhase;
  phaseAfter: SurfacePhase;
  attempt?: number;
  maxAttempts?: number;
  reason?: string | null;
}): void {
  if (!shouldLogSurfaceTransitions()) {
    return;
  }
  transitionLogSequence += 1;
  const base = {
    sequence: transitionLogSequence,
    source: options.source,
    correlation_id: options.correlationId,
    mode: options.mode,
    phase_before: options.phaseBefore,
    phase_after: options.phaseAfter,
  } as Record<string, unknown>;

  if (typeof options.attempt === 'number') {
    base.attempt = options.attempt;
  }
  if (typeof options.maxAttempts === 'number') {
    base.max_attempts = options.maxAttempts;
  }
  if (typeof options.reason === 'string' && options.reason.length > 0) {
    base.reason = options.reason;
  }

  console.log('[SurfaceOrchestrator] transition', base);
}

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

async function isMainWindowVisible(): Promise<boolean> {
  try {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY);
    return result?.success === true && result?.data?.visible === true;
  } catch (_error) {
    return false;
  }
}

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
  if (typeof payload.request_id === 'string' && payload.request_id.length > 0) {
    return payload.request_id;
  }
  if (typeof payload.correlation_id === 'string' && payload.correlation_id.length > 0) {
    return payload.correlation_id;
  }
  return null;
}

export async function prepareToolExecutionSurface(
  mode: SurfaceMode,
  options: {
    correlationId?: string | null;
    source?: SurfaceTransitionSource;
    focusWaitMs?: number;
    focusMaxAttempts?: number;
  } = {},
): Promise<ToolSurfacePreparation> {
  const source = options.source || 'tool-runner';
  const correlationId = resolveCorrelationId(options.correlationId, 'surface');
  if (mode === 'none') {
    logSurfaceTransition({
      source,
      correlationId,
      mode,
      phaseBefore: 'idle',
      phaseAfter: 'idle',
      reason: 'no_surface_transition_needed',
    });
    return {
      restoreChatPillAfterExecution: false,
      canExecute: true,
      failureReason: null,
      surfaceToken: null,
      overlayIgnoreEnabled: false,
      mode,
      correlationId,
    };
  }

  let surfaceToken: number | null = null;
  let overlayIgnoreEnabled = false;
  const surfaceAlreadyPrepared = activeSurfaceTokens.size > 0;
  const shouldCollapseForScreenshot = (
    mode === 'screenshot'
    && !surfaceAlreadyPrepared
    && await isMainWindowVisible()
  );

  try {
    if (shouldCollapseForScreenshot) {
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: 'idle',
        phaseAfter: 'preparing_capture_visibility',
      });
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
      await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
      pendingChatPillRestore = true;
      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: 'preparing_capture_visibility',
        phaseAfter: 'capture_ready',
      });
    }

    surfaceToken = registerSurfaceToken();

    if (mode === 'interactive') {
      const waitMs = typeof options.focusWaitMs === 'number'
        ? options.focusWaitMs
        : DEFAULT_TOOL_FOCUS_PREPARE_WAIT_MS;
      const maxAttempts = typeof options.focusMaxAttempts === 'number'
        ? options.focusMaxAttempts
        : DEFAULT_TOOL_FOCUS_PREPARE_MAX_ATTEMPTS;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        logSurfaceTransition({
          source,
          correlationId,
          mode,
          phaseBefore: attempt === 1 ? 'idle' : 'preparing_interactive_focus',
          phaseAfter: 'preparing_interactive_focus',
          attempt,
          maxAttempts,
        });

        const focusPreparation = await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
          waitMs,
        });
        const canVerifyExternalFocus = focusPreparation?.data?.canVerifyExternalFocus === true;
        const externalFocusActive = focusPreparation?.data?.externalFocusActive === true;

        if (focusPreparation?.success === false) {
          const failureReason = typeof focusPreparation?.reason === 'string'
            ? focusPreparation.reason
            : 'overlay_focus_prepare_failed';
          logSurfaceTransition({
            source,
            correlationId,
            mode,
            phaseBefore: 'preparing_interactive_focus',
            phaseAfter: 'failed_terminal',
            attempt,
            maxAttempts,
            reason: failureReason,
          });
          return {
            restoreChatPillAfterExecution: true,
            canExecute: false,
            failureReason,
            surfaceToken,
            overlayIgnoreEnabled,
            mode,
            correlationId,
          };
        }

        if (!canVerifyExternalFocus || externalFocusActive) {
          try {
            const ignoreResult = await IpcBridge.invoke(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, {
              ignore: true,
            });
            overlayIgnoreEnabled = ignoreResult?.success !== false;
            if (overlayIgnoreEnabled) {
              markOverlayIgnoreForToken(surfaceToken);
            }
          } catch (error) {
            console.warn('[SurfaceOrchestrator] Failed to enable overlay click-through for tool execution:', error);
          }
          logSurfaceTransition({
            source,
            correlationId,
            mode,
            phaseBefore: 'preparing_interactive_focus',
            phaseAfter: 'interactive_ready',
            attempt,
            maxAttempts,
          });
          return {
            restoreChatPillAfterExecution: true,
            canExecute: true,
            failureReason: null,
            surfaceToken,
            overlayIgnoreEnabled,
            mode,
            correlationId,
          };
        }
      }

      logSurfaceTransition({
        source,
        correlationId,
        mode,
        phaseBefore: 'preparing_interactive_focus',
        phaseAfter: 'failed_terminal',
        reason: 'external_window_focus_not_verified',
      });
      return {
        restoreChatPillAfterExecution: shouldCollapseForScreenshot,
        canExecute: false,
        failureReason: 'external_window_focus_not_verified',
        surfaceToken,
        overlayIgnoreEnabled,
        mode,
        correlationId,
      };
    }

    return {
      restoreChatPillAfterExecution: shouldCollapseForScreenshot,
      canExecute: true,
      failureReason: null,
      surfaceToken,
      overlayIgnoreEnabled,
      mode,
      correlationId,
    };
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to prepare tool execution surface:', error);
    logSurfaceTransition({
      source,
      correlationId,
      mode,
      phaseBefore: mode === 'interactive' ? 'preparing_interactive_focus' : 'preparing_capture_visibility',
      phaseAfter: 'failed_terminal',
      reason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
    });
    return {
      restoreChatPillAfterExecution: surfaceToken !== null,
      canExecute: false,
      failureReason: OVERLAY_SURFACE_PREPARE_EXCEPTION,
      surfaceToken,
      overlayIgnoreEnabled,
      mode,
      correlationId,
    };
  }
}

export async function restoreToolExecutionSurface(
  preparation: ToolSurfacePreparation,
  options: {
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const source = options.source || 'tool-runner';
  const correlationId = resolveCorrelationId(preparation.correlationId, 'surface-restore');

  logSurfaceTransition({
    source,
    correlationId,
    mode: preparation.mode,
    phaseBefore: 'idle',
    phaseAfter: 'restoring_surface',
  });

  if (preparation.overlayIgnoreEnabled && unmarkOverlayIgnoreForToken(preparation.surfaceToken)) {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_OVERLAY_IGNORE_MOUSE, { ignore: false });
    } catch (error) {
      console.warn('[SurfaceOrchestrator] Failed to disable overlay click-through after tool execution:', error);
    }
  }

  const shouldRestoreChatPill = releaseSurfaceToken(preparation.surfaceToken);
  if (!shouldRestoreChatPill || !pendingChatPillRestore) {
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: 'restoring_surface',
      phaseAfter: 'idle',
      reason: 'restore_not_required',
    });
    return;
  }

  try {
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    pendingChatPillRestore = false;
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: 'restoring_surface',
      phaseAfter: 'idle',
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to restore chat pill after tool execution:', error);
    logSurfaceTransition({
      source,
      correlationId,
      mode: preparation.mode,
      phaseBefore: 'restoring_surface',
      phaseAfter: 'failed_terminal',
      reason: 'restore_chatbox_failed',
    });
  }
}

export async function ensureToolExecutionSurface(
  toolName: string,
  args: Record<string, unknown> | undefined,
  options: {
    correlationId?: string | null;
    source?: SurfaceTransitionSource;
    focusWaitMs?: number;
    focusMaxAttempts?: number;
  } = {},
): Promise<ToolSurfacePreparation> {
  const mode = resolveToolSurfaceMode(toolName, args);
  return prepareToolExecutionSurface(mode, options);
}

export async function prepareScreenshotCaptureVisibility(
  options: {
    captureId?: string | null;
    source?: SurfaceTransitionSource;
  } = {},
): Promise<CaptureVisibilityPreparation> {
  const source = options.source || 'system-capture';
  const captureId = resolveCorrelationId(options.captureId, 'capture');

  activeScreenshotCaptureCount += 1;
  if (activeScreenshotCaptureCount > 1) {
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'capture_ready',
      phaseAfter: 'capture_ready',
      reason: 'capture_overlap_reuse',
    });
    return { prepared: true, captureId };
  }

  try {
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'idle',
      phaseAfter: 'preparing_capture_visibility',
    });
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    pendingScreenshotCaptureRestore = true;
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_capture_visibility',
      phaseAfter: 'capture_ready',
    });
    return { prepared: true, captureId };
  } catch (error) {
    activeScreenshotCaptureCount = Math.max(0, activeScreenshotCaptureCount - 1);
    console.warn('[SurfaceOrchestrator] Failed to hide chat pill before screenshot capture:', error);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_capture_visibility',
      phaseAfter: 'failed_terminal',
      reason: 'prepare_capture_visibility_failed',
    });
    return { prepared: false, captureId };
  }
}

export async function restoreScreenshotCaptureVisibility(
  preparation: CaptureVisibilityPreparation,
  options: {
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const source = options.source || 'system-capture';
  if (!preparation.prepared) {
    return;
  }

  activeScreenshotCaptureCount = Math.max(0, activeScreenshotCaptureCount - 1);
  if (activeScreenshotCaptureCount > 0 || !pendingScreenshotCaptureRestore) {
    return;
  }

  logSurfaceTransition({
    source,
    correlationId: preparation.captureId,
    mode: 'screenshot',
    phaseBefore: 'capture_ready',
    phaseAfter: 'restoring_surface',
  });

  try {
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to restore chat pill after screenshot capture:', error);
    logSurfaceTransition({
      source,
      correlationId: preparation.captureId,
      mode: 'screenshot',
      phaseBefore: 'restoring_surface',
      phaseAfter: 'failed_terminal',
      reason: 'capture_restore_failed',
    });
  } finally {
    pendingScreenshotCaptureRestore = false;
    logSurfaceTransition({
      source,
      correlationId: preparation.captureId,
      mode: 'screenshot',
      phaseBefore: 'restoring_surface',
      phaseAfter: 'idle',
    });
  }
}

export async function prepareExternalFocusForCapture(
  options: {
    captureId?: string | null;
    waitMs?: number;
    source?: SurfaceTransitionSource;
  } = {},
): Promise<void> {
  const source = options.source || 'system-capture';
  const captureId = resolveCorrelationId(options.captureId, 'capture-focus');
  const waitMs = typeof options.waitMs === 'number'
    ? options.waitMs
    : DEFAULT_CAPTURE_FOCUS_PREPARE_WAIT_MS;

  try {
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'capture_ready',
      phaseAfter: 'preparing_interactive_focus',
    });
    await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs,
    });
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_interactive_focus',
      phaseAfter: 'capture_ready',
    });
  } catch (error) {
    console.warn('[SurfaceOrchestrator] Failed to prepare external focus before capture:', error);
    logSurfaceTransition({
      source,
      correlationId: captureId,
      mode: 'screenshot',
      phaseBefore: 'preparing_interactive_focus',
      phaseAfter: 'failed_terminal',
      reason: 'capture_focus_prepare_failed',
    });
  }
}

export function __resetSurfaceOrchestratorStateForTests(): void {
  activeSurfaceTokens.clear();
  activeOverlayIgnoreTokens.clear();
  nextSurfaceToken = 1;
  pendingChatPillRestore = false;
  activeScreenshotCaptureCount = 0;
  pendingScreenshotCaptureRestore = false;
  transitionLogSequence = 0;
  nextSyntheticCorrelationId = 1;
}
