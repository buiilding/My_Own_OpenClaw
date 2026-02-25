/**
 * useToolRunner Hook.
 * Connects UI to ToolExecutionService.
 * Handles tool execution events and updates chat store.
 */

import { useCallback, useEffect, useRef } from 'react';
import { IpcBridge, ON_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { ToolExecutionService, type ToolExecutionResult, type BundleExecutionResult } from '../../../infrastructure/services/ToolExecutionService';
import { useChatStore } from '../stores/chatStore';
import { recordToolMessage } from '../../../infrastructure/transcript/TranscriptWriter';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { type ToolBundleEvent, type ToolCallEvent, isBackendEvent } from '../../../types/backendEvents';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../constants/toolGhostRuntime';
import {
  buildBundleOutputMessage,
  buildToolOutputMessage,
  buildTranscriptMetadata,
  mapBundleTools,
  resolveToolCallCorrelationId,
  type TranscriptModelContext,
} from '../utils/toolRunnerMessages';

const TERMINAL_STREAM_PHASES = new Set(['idle', 'complete', 'error']);
const MOUSE_CLICK_ACTIONS = new Set(['click', 'double_click', 'right_click']);
const CLICK_TOOL_NAMES = new Set(['click', 'double_click', 'right_click']);

function shouldSkipToolExecution(
  metadata: Record<string, unknown> | undefined,
): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return metadata.skip_frontend_execution === true;
}

function shouldIgnoreToolEventForTurn(turnRef: string | null | undefined): boolean {
  if (!turnRef) {
    return false;
  }
  const { streamTracking } = useChatStore.getState();
  if (!streamTracking.activeTurnRef) {
    return true;
  }
  if (streamTracking.activeTurnRef !== turnRef) {
    return true;
  }
  return TERMINAL_STREAM_PHASES.has(streamTracking.phase);
}

function resolveToolRequestIdForCancellation(
  payload: ToolCallEvent['payload'] | undefined,
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

function shouldDelayForToolGhostClickSync(
  toolName: string,
  parameters: Record<string, unknown>,
): boolean {
  if (CLICK_TOOL_NAMES.has(toolName)) {
    return true;
  }
  if (toolName !== 'mouse_control') {
    return false;
  }
  const rawAction = parameters.action;
  if (typeof rawAction !== 'string') {
    return false;
  }
  return MOUSE_CLICK_ACTIONS.has(rawAction.trim().toLowerCase());
}

async function waitForToolGhostClickSync(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, TOOL_GHOST_CLICK_SYNC_DELAY_MS);
  });
}

/**
 * Custom hook for managing tool execution.
 * Connects UI to ToolExecutionService and handles tool-related events.
 */
export function useToolRunner(enabled = true) {
  const addMessage = useChatStore((state) => state.addMessage);
  const streamTracking = useChatStore((state) => state.streamTracking);
  const { config } = useAppConfigContext();

  const toolServiceRef = useRef<ToolExecutionService | null>(null);
  const trackedExecutionTurnsRef = useRef<Map<string, string | null>>(new Map());
  const modelContextRef = useRef<TranscriptModelContext>({
    modelId: null,
    modelProvider: null,
  });
  modelContextRef.current = {
    modelId: config?.selected_model_id || null,
    modelProvider: config?.model_provider || null,
  };

  const trackExecution = useCallback((correlationId: string | null | undefined, turnRef: string | null) => {
    if (!correlationId) {
      return;
    }
    trackedExecutionTurnsRef.current.set(correlationId, turnRef);
  }, []);

  const untrackExecution = useCallback((correlationId: string | null | undefined) => {
    if (!correlationId) {
      return;
    }
    trackedExecutionTurnsRef.current.delete(correlationId);
  }, []);

  const shouldAcceptExecutionResult = useCallback((correlationId: string | null | undefined) => {
    if (!correlationId) {
      return true;
    }
    return trackedExecutionTurnsRef.current.has(correlationId);
  }, []);

  const sendStaleToolCancellation = useCallback((requestId: string | null | undefined) => {
    if (!requestId) {
      return;
    }
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
      type: 'tool-result',
      payload: {
        request_id: requestId,
        success: false,
        data: null,
        error: 'frontend_stale_turn_cancelled',
      },
    });
  }, []);

  useEffect(() => {
    const activeTurnRef = streamTracking.activeTurnRef;
    const phase = streamTracking.phase;
    const trackedEntries = trackedExecutionTurnsRef.current;
    if (trackedEntries.size === 0) {
      return;
    }

    if (!activeTurnRef) {
      if (TERMINAL_STREAM_PHASES.has(phase)) {
        trackedEntries.clear();
      }
      return;
    }

    if (TERMINAL_STREAM_PHASES.has(phase)) {
      for (const [correlationId, turnRef] of trackedEntries.entries()) {
        if (!turnRef || turnRef === activeTurnRef) {
          trackedEntries.delete(correlationId);
        }
      }
      return;
    }

    for (const [correlationId, turnRef] of trackedEntries.entries()) {
      if (turnRef && turnRef !== activeTurnRef) {
        trackedEntries.delete(correlationId);
      }
    }
  }, [streamTracking.activeTurnRef, streamTracking.phase]);

  useEffect(() => {
    if (!enabled) {
      toolServiceRef.current = null;
      trackedExecutionTurnsRef.current.clear();
      return undefined;
    }
    const toolService = new ToolExecutionService({
      onToolResult: (result: ToolExecutionResult) => {
        if (!shouldAcceptExecutionResult(result.correlationId)) {
          return;
        }
        addMessage(buildToolOutputMessage(result));
        recordToolMessage(
          result.formattedMessage,
          buildTranscriptMetadata(
            result.toolName,
            result.correlationId,
            result.screenshotRef,
            modelContextRef.current,
          ),
        );
      },
      onBundleResult: (result: BundleExecutionResult) => {
        if (!shouldAcceptExecutionResult(result.correlationId)) {
          return;
        }
        addMessage(buildBundleOutputMessage(result));
        recordToolMessage(
          result.formattedMessage,
          buildTranscriptMetadata(
            'bundled_tools',
            result.correlationId,
            result.screenshotRef,
            modelContextRef.current,
          ),
        );
      },
      sendToBackend: (payload: unknown) => {
        const message = payload as { type?: string; payload?: Record<string, unknown> } | null;
        const payloadType = message?.type;
        let correlationId: string | null = null;
        if (payloadType === 'tool-result' && typeof message?.payload?.request_id === 'string') {
          correlationId = message.payload.request_id;
        } else if (payloadType === 'tool-bundle-result' && typeof message?.payload?.bundle_id === 'string') {
          correlationId = message.payload.bundle_id;
        }
        if (correlationId && !shouldAcceptExecutionResult(correlationId)) {
          return;
        }
        IpcBridge.send(SEND_CHANNELS.TO_BACKEND, payload);
        if (correlationId) {
          untrackExecution(correlationId);
        }
      },
    });

    toolServiceRef.current = toolService;
    const trackedExecutionTurns = trackedExecutionTurnsRef.current;

    return () => {
      toolServiceRef.current = null;
      trackedExecutionTurns.clear();
    };
  }, [
    addMessage,
    enabled,
    shouldAcceptExecutionResult,
    untrackExecution,
  ]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    if (shouldIgnoreToolEventForTurn(event.turn_ref)) {
      const bundleId = event.payload?.bundle_id;
      if (typeof bundleId === 'string' && bundleId.length > 0) {
        IpcBridge.send(SEND_CHANNELS.TO_BACKEND, {
          type: 'tool-bundle-result',
          payload: {
            bundle_id: bundleId,
            status: 'failure',
            step_results: [],
            error: 'frontend_stale_turn_cancelled',
          },
        });
      }
      return;
    }
    const bundleId = event.payload?.bundle_id || `bundle-${crypto.randomUUID()}`;
    const tools = mapBundleTools(event.payload?.tools);

    if (tools.length === 0) {
      return;
    }

    if (toolServiceRef.current) {
      const turnRef = event.turn_ref ?? useChatStore.getState().streamTracking.activeTurnRef ?? null;
      trackExecution(bundleId, turnRef);
      toolServiceRef.current.executeToolBundle(tools, bundleId).catch(err => {
        untrackExecution(bundleId);
        console.error('[useToolRunner] Failed to execute bundle:', err);
      });
    }
  }, [trackExecution, untrackExecution]);

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    if (shouldIgnoreToolEventForTurn(event.turn_ref)) {
      const requestId = resolveToolRequestIdForCancellation(event.payload);
      sendStaleToolCancellation(requestId);
      return;
    }
    const toolName = event.payload?.tool_name;
    const parameters = event.payload?.parameters;
    if (!toolName || !parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
      return;
    }
    if (shouldSkipToolExecution(event.payload?.metadata)) {
      return;
    }

    const correlationId = resolveToolCallCorrelationId(event.payload, event.id);

    const turnRef = event.turn_ref ?? useChatStore.getState().streamTracking.activeTurnRef ?? null;
    const cancellationRequestId = resolveToolRequestIdForCancellation(event.payload) || correlationId;

    const executeToolCall = async () => {
      if (shouldDelayForToolGhostClickSync(toolName, parameters)) {
        await waitForToolGhostClickSync();
        if (shouldIgnoreToolEventForTurn(turnRef)) {
          sendStaleToolCancellation(cancellationRequestId);
          return;
        }
      }

      const toolService = toolServiceRef.current;
      if (!toolService) {
        return;
      }

      trackExecution(correlationId, turnRef);
      try {
        await toolService.executeTool(
          toolName,
          parameters,
          {
            correlationId,
            skipAutoCapture: false
          }
        );
      } catch (err) {
        untrackExecution(correlationId);
        console.error('[useToolRunner] Failed to execute tool:', err);
      }
    };

    void executeToolCall();
  }, [sendStaleToolCancellation, trackExecution, untrackExecution]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data: unknown) => {
      if (!isBackendEvent(data)) {
        return;
      }
      if (data.type === 'tool-bundle') {
        handleToolBundle(data);
      }
      if (data.type === 'tool-call') {
        handleToolCall(data);
      }
    });

    return removeListener;
  }, [enabled, handleToolBundle, handleToolCall]);
}
