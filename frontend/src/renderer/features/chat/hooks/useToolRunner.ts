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
import {
  buildBundleOutputMessage,
  buildToolOutputMessage,
  buildTranscriptMetadata,
  mapBundleTools,
  resolveToolCallCorrelationId,
  type TranscriptModelContext,
} from '../utils/toolRunnerMessages';

const TERMINAL_STREAM_PHASES = new Set(['idle', 'complete', 'error']);

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

/**
 * Custom hook for managing tool execution.
 * Connects UI to ToolExecutionService and handles tool-related events.
 */
export function useToolRunner(enabled = true) {
  const addMessage = useChatStore((state) => state.addMessage);
  const streamTracking = useChatStore((state) => state.streamTracking);
  const { config } = useAppConfigContext();
  const modelId = config?.selected_model_id || null;
  const modelProvider = config?.model_provider || null;

  const toolServiceRef = useRef<ToolExecutionService | null>(null);
  const trackedExecutionTurnsRef = useRef<Map<string, string | null>>(new Map());
  const modelContextRef = useRef<TranscriptModelContext>({
    modelId,
    modelProvider,
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

  useEffect(() => {
    modelContextRef.current = { modelId, modelProvider };
  }, [modelId, modelProvider]);

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

    return () => {
      toolServiceRef.current = null;
      trackedExecutionTurnsRef.current.clear();
    };
  }, [
    addMessage,
    enabled,
    shouldAcceptExecutionResult,
    untrackExecution,
  ]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    if (shouldIgnoreToolEventForTurn(event.turn_ref)) {
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

    if (toolServiceRef.current) {
      const turnRef = event.turn_ref ?? useChatStore.getState().streamTracking.activeTurnRef ?? null;
      trackExecution(correlationId, turnRef);
      toolServiceRef.current.executeTool(
        toolName,
        parameters,
        {
          correlationId,
          skipAutoCapture: false
        }
      ).catch(err => {
        untrackExecution(correlationId);
        console.error('[useToolRunner] Failed to execute tool:', err);
      });
    }
  }, [trackExecution, untrackExecution]);

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
