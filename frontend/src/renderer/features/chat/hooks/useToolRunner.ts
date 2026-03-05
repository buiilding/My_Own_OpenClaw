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
import {
  type TrackedExecution,
  trackExecutionTurn,
  untrackExecutionTurn,
} from '../utils/toolRunnerTracking';
import { executeWithSurfaceLifecycle } from '../utils/toolRunnerSurfaceExecution';
import {
  resolveToolRunnerPayloadCorrelationId,
  shouldDropUntrackedToolRunnerPayload,
} from '../utils/toolRunnerBackendPayload';
import {
  resolveToolEventConversationRef,
  shouldIgnoreToolEventForTurn,
} from '../utils/toolRunnerEventGuards';
import {
  resolveExecutionConversationRef as resolveExecutionConversationRefFromState,
  shouldAcceptExecutionResult as shouldAcceptExecutionResultFromState,
} from '../utils/toolRunnerExecutionState';

/**
 * Custom hook for managing tool execution.
 * Connects UI to ToolExecutionService and handles tool-related events.
 */
export function useToolRunner(enabled = true) {
  const addMessage = useChatStore((state) => state.addMessage);
  const { config } = useAppConfigContext();

  const toolServiceRef = useRef<ToolExecutionService | null>(null);
  const trackedExecutionTurnsRef = useRef<Map<string, TrackedExecution>>(new Map());
  const modelContextRef = useLatestRef<TranscriptModelContext>({
    modelId: config?.selected_model_id || null,
    modelProvider: config?.model_provider || null,
  });

  const trackExecution = useCallback((
    correlationId: string | null | undefined,
    turnRef: string | null,
    conversationRef: string | null,
  ) => {
    trackExecutionTurn(trackedExecutionTurnsRef.current, correlationId, turnRef, conversationRef);
  }, []);

  const untrackExecution = useCallback((correlationId: string | null | undefined) => {
    untrackExecutionTurn(trackedExecutionTurnsRef.current, correlationId);
  }, []);

  const shouldAcceptExecutionResult = useCallback((correlationId: string | null | undefined) => {
    return shouldAcceptExecutionResultFromState(
      trackedExecutionTurnsRef.current,
      correlationId,
    );
  }, []);

  const resolveExecutionConversationRef = useCallback((correlationId: string | null | undefined) => {
    return resolveExecutionConversationRefFromState(
      trackedExecutionTurnsRef.current,
      correlationId,
    );
  }, []);

  const sendStaleToolCancellation = useCallback((requestId: string | null | undefined) => {
    if (!requestId) {
      return;
    }
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, buildStaleToolResultEnvelope(requestId));
  }, []);

  const sendStaleBundleCancellation = useCallback((bundleId: string | null | undefined) => {
    if (!bundleId) {
      return;
    }
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, buildStaleBundleResultEnvelope(bundleId));
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
    conversationRef: string | null,
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
    }), conversationRef);
    recordToolMessage(
      formattedMessage,
      {
        ...buildTranscriptMetadata(
          toolName,
          correlationId,
          null,
          modelContextRef.current,
        ),
        conversationRef: conversationRef || undefined,
      },
    );
  }, [addMessage, modelContextRef]);

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
        const conversationRef = resolveExecutionConversationRef(result.correlationId);
        addMessage(buildToolOutputMessage(result), conversationRef);
        recordToolMessage(
          result.formattedMessage,
          {
            ...buildTranscriptMetadata(
              result.toolName,
              result.correlationId,
              result.screenshotRef,
              modelContextRef.current,
            ),
            conversationRef: conversationRef || undefined,
          },
        );
      },
      onBundleResult: (result: BundleExecutionResult) => {
        if (!shouldAcceptExecutionResult(result.correlationId)) {
          return;
        }
        const conversationRef = resolveExecutionConversationRef(result.correlationId);
        addMessage(buildBundleOutputMessage(result), conversationRef);
        recordToolMessage(
          result.formattedMessage,
          {
            ...buildTranscriptMetadata(
              'bundled_tools',
              result.correlationId,
              result.screenshotRef,
              modelContextRef.current,
            ),
            conversationRef: conversationRef || undefined,
          },
        );
      },
      sendToBackend: (payload: unknown) => {
        const correlationId = resolveToolRunnerPayloadCorrelationId(payload);
        if (shouldDropUntrackedToolRunnerPayload(correlationId, shouldAcceptExecutionResult)) {
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
    resolveExecutionConversationRef,
    shouldAcceptExecutionResult,
    untrackExecution,
  ]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    const conversationRef = resolveToolEventConversationRef(event);
    if (shouldIgnoreToolEventForTurn(event.turn_ref, conversationRef)) {
      const bundleId = event.payload?.bundle_id;
      sendStaleBundleCancellation(typeof bundleId === 'string' ? bundleId : null);
      return;
    }
    const bundleId = event.payload?.bundle_id || `bundle-${crypto.randomUUID()}`;
    const tools = mapBundleTools(event.payload?.tools);

    if (tools.length === 0) {
      return;
    }

    if (toolServiceRef.current) {
      const toolService = toolServiceRef.current;
      const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
      const turnRef = event.turn_ref ?? workspace.streamTracking.activeTurnRef ?? null;
      executeWithSurfaceLifecycle({
        correlationId: bundleId,
        turnRef,
        conversationRef,
        trackExecution,
        untrackExecution,
        prepareSurface: () => prepareToolExecutionSurface(resolveBundleSurfaceMode(tools), {
          correlationId: bundleId,
          source: 'tool-runner',
        }),
        runExecution: async () => {
          await toolService.executeToolBundle(tools, bundleId);
        },
        restoreSurface: async (preparation) => {
          await restoreToolExecutionSurface(preparation, { source: 'tool-runner' });
        },
        onPreparationFailure: async (preparation) => {
          const failureError = buildSurfaceFailureError(preparation.failureReason);
          emitSurfaceFailureOutput(
            `bundled_tools (${tools.length} tools)`,
            bundleId,
            failureError,
            conversationRef,
          );
          sendBundleSurfaceFailure(bundleId, preparation.failureReason);
        },
        onExecutionError: (err) => {
          console.error('[useToolRunner] Failed to execute bundle:', err);
        },
      }).catch(err => {
        untrackExecution(bundleId);
        console.error('[useToolRunner] Failed to execute bundle:', err);
      });
    }
  }, [
    emitSurfaceFailureOutput,
    sendStaleBundleCancellation,
    sendBundleSurfaceFailure,
    trackExecution,
    untrackExecution,
  ]);

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    const conversationRef = resolveToolEventConversationRef(event);
    if (shouldIgnoreToolEventForTurn(event.turn_ref, conversationRef)) {
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

    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const turnRef = event.turn_ref ?? workspace.streamTracking.activeTurnRef ?? null;
    void executeWithSurfaceLifecycle({
      correlationId,
      turnRef,
      conversationRef,
      trackExecution,
      untrackExecution,
      prepareSurface: () => ensureToolExecutionSurface(toolName, parameters, {
        correlationId,
        source: 'tool-runner',
      }),
      runExecution: async () => {
        const toolService = toolServiceRef.current;
        if (!toolService) {
          return;
        }
        await toolService.executeTool(
          toolName,
          parameters,
          {
            correlationId,
            skipAutoCapture: false,
          },
        );
      },
      restoreSurface: async (preparation) => {
        await restoreToolExecutionSurface(preparation, { source: 'tool-runner' });
      },
      onPreparationFailure: async (preparation) => {
        const failureError = buildSurfaceFailureError(preparation.failureReason);
        emitSurfaceFailureOutput(toolName, correlationId, failureError, conversationRef);
        sendToolSurfaceFailure(correlationId, preparation.failureReason);
      },
      onExecutionError: (err) => {
        console.error('[useToolRunner] Failed to execute tool:', err);
      },
    }).catch((err) => {
      untrackExecution(correlationId);
      console.error('[useToolRunner] Failed to execute tool:', err);
    });
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
