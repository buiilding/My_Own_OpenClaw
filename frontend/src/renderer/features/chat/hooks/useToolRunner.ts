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

/**
 * Custom hook for managing tool execution.
 * Connects UI to ToolExecutionService and handles tool-related events.
 */
export function useToolRunner(enabled = true) {
  const addMessage = useChatStore((state) => state.addMessage);
  const { config } = useAppConfigContext();
  const modelId = config?.selected_model_id || null;
  const modelProvider = config?.model_provider || null;

  const toolServiceRef = useRef<ToolExecutionService | null>(null);
  const modelContextRef = useRef<TranscriptModelContext>({
    modelId,
    modelProvider,
  });

  useEffect(() => {
    modelContextRef.current = { modelId, modelProvider };
  }, [modelId, modelProvider]);

  useEffect(() => {
    if (!enabled) {
      toolServiceRef.current = null;
      return undefined;
    }
    const toolService = new ToolExecutionService({
      onToolResult: (result: ToolExecutionResult) => {
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
        IpcBridge.send(SEND_CHANNELS.TO_BACKEND, payload);
      },
    });

    toolServiceRef.current = toolService;

    return () => {
      toolServiceRef.current = null;
    };
  }, [addMessage, enabled]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    const bundleId = event.payload?.bundle_id || `bundle-${crypto.randomUUID()}`;
    const tools = mapBundleTools(event.payload?.tools);

    if (tools.length === 0) {
      return;
    }

    if (toolServiceRef.current) {
      toolServiceRef.current.executeToolBundle(tools, bundleId).catch(err => {
        console.error('[useToolRunner] Failed to execute bundle:', err);
      });
    }
  }, []);

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    if (!event.payload?.tool_name || !event.payload?.parameters) {
      return;
    }

    const correlationId = resolveToolCallCorrelationId(event.payload, event.id);

    if (toolServiceRef.current) {
      toolServiceRef.current.executeTool(
        event.payload.tool_name,
        event.payload.parameters,
        {
          correlationId,
          skipAutoCapture: false
        }
      ).catch(err => {
        console.error('[useToolRunner] Failed to execute tool:', err);
      });
    }
  }, []);

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
