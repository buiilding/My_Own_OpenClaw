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
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import {
  buildBundleOutputMessage,
  buildToolOutputMessage,
  buildTranscriptMetadata,
  mapBundleTools,
  resolveToolCallCorrelationId,
  type TranscriptModelContext,
} from '../utils/toolRunnerMessages';
import {
  buildBundleSurfaceFailureEnvelope,
  buildStaleBundleResultEnvelope,
  buildStaleToolResultEnvelope,
  buildSurfaceFailureError,
  buildToolSurfaceFailureEnvelope,
} from '../utils/toolRunnerFailureContracts';
import { formatToolOutputMessage } from '../../../infrastructure/services/MessageFormatter';
import {
  ensureToolExecutionSurface,
  prepareToolExecutionSurface,
  resolveBundleSurfaceMode,
  resolveToolRequestIdForCancellation,
  restoreToolExecutionSurface,
  shouldSkipToolExecution,
} from '../utils/toolRunnerSurface';
import { isTerminalStreamPhase } from '../utils/streamPhaseState';

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
  return isTerminalStreamPhase(streamTracking.phase);
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
  const modelContextRef = useLatestRef<TranscriptModelContext>({
    modelId: config?.selected_model_id || null,
    modelProvider: config?.model_provider || null,
  });

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
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, buildStaleToolResultEnvelope(requestId));
  }, []);

  const sendToolSurfaceFailure = useCallback((
    requestId: string | null | undefined,
    reason: string | null,
  ) => {
    if (!requestId) {
      return;
    }
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, buildToolSurfaceFailureEnvelope(requestId, reason));
  }, []);

  const sendBundleSurfaceFailure = useCallback((
    bundleId: string,
    reason: string | null,
  ) => {
    if (!bundleId) {
      return;
    }
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, buildBundleSurfaceFailureEnvelope(bundleId, reason));
  }, []);

  const emitSurfaceFailureOutput = useCallback((
    toolName: string,
    correlationId: string,
    failureError: string,
  ) => {
    const result = {
      success: false,
      error: failureError,
      data: null,
    };
    const formattedMessage = formatToolOutputMessage(toolName, result, null, false);
    addMessage(buildToolOutputMessage({
      toolName,
      result,
      executionTime: 0,
      correlationId,
      formattedMessage,
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      systemState: null,
    }));
    recordToolMessage(
      formattedMessage,
      buildTranscriptMetadata(
        toolName,
        correlationId,
        null,
        modelContextRef.current,
      ),
    );
  }, [addMessage, modelContextRef]);

  useEffect(() => {
    const activeTurnRef = streamTracking.activeTurnRef;
    const phase = streamTracking.phase;
    const trackedEntries = trackedExecutionTurnsRef.current;
    if (trackedEntries.size === 0) {
      return;
    }

    if (!activeTurnRef) {
      if (isTerminalStreamPhase(phase)) {
        trackedEntries.clear();
      }
      return;
    }

    if (isTerminalStreamPhase(phase)) {
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
    modelContextRef,
    shouldAcceptExecutionResult,
    untrackExecution,
  ]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    if (shouldIgnoreToolEventForTurn(event.turn_ref)) {
      const bundleId = event.payload?.bundle_id;
      if (typeof bundleId === 'string' && bundleId.length > 0) {
        IpcBridge.send(SEND_CHANNELS.TO_BACKEND, buildStaleBundleResultEnvelope(bundleId));
      }
      return;
    }
    const bundleId = event.payload?.bundle_id || `bundle-${crypto.randomUUID()}`;
    const tools = mapBundleTools(event.payload?.tools);

    if (tools.length === 0) {
      return;
    }

    if (toolServiceRef.current) {
      const toolService = toolServiceRef.current;
      const turnRef = event.turn_ref ?? useChatStore.getState().streamTracking.activeTurnRef ?? null;
      trackExecution(bundleId, turnRef);
      const executeBundle = async () => {
        const preparation = await prepareToolExecutionSurface(resolveBundleSurfaceMode(tools), {
          correlationId: bundleId,
          source: 'tool-runner',
        });
        if (!preparation.canExecute) {
          const failureError = buildSurfaceFailureError(preparation.failureReason);
          emitSurfaceFailureOutput(`bundled_tools (${tools.length} tools)`, bundleId, failureError);
          sendBundleSurfaceFailure(bundleId, preparation.failureReason);
          untrackExecution(bundleId);
          await restoreToolExecutionSurface(preparation, { source: 'tool-runner' });
          return;
        }
        try {
          await toolService.executeToolBundle(tools, bundleId);
        } finally {
          await restoreToolExecutionSurface(preparation, { source: 'tool-runner' });
        }
      };
      executeBundle().catch(err => {
        untrackExecution(bundleId);
        console.error('[useToolRunner] Failed to execute bundle:', err);
      });
    }
  }, [
    emitSurfaceFailureOutput,
    sendBundleSurfaceFailure,
    trackExecution,
    untrackExecution,
  ]);

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
    const executeToolCall = async () => {
      const toolService = toolServiceRef.current;
      if (!toolService) {
        return;
      }

      trackExecution(correlationId, turnRef);
      const preparation = await ensureToolExecutionSurface(toolName, parameters, {
        correlationId,
        source: 'tool-runner',
      });
      if (!preparation.canExecute) {
        const failureError = buildSurfaceFailureError(preparation.failureReason);
        emitSurfaceFailureOutput(toolName, correlationId, failureError);
        sendToolSurfaceFailure(correlationId, preparation.failureReason);
        untrackExecution(correlationId);
        await restoreToolExecutionSurface(preparation, { source: 'tool-runner' });
        return;
      }
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
      } finally {
        await restoreToolExecutionSurface(preparation, { source: 'tool-runner' });
      }
    };

    void executeToolCall();
  }, [
    emitSurfaceFailureOutput,
    sendStaleToolCancellation,
    sendToolSurfaceFailure,
    trackExecution,
    untrackExecution,
  ]);

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
