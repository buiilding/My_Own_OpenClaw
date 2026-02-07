/**
 * useToolRunner Hook.
 * Connects UI to ToolExecutionService.
 * Handles tool execution events and updates chat store.
 */

import { useCallback, useEffect, useRef } from 'react';
import { IpcBridge, ON_CHANNELS, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { ToolExecutionService, type ToolExecutionResult, type BundleExecutionResult } from '../../../infrastructure/services/ToolExecutionService';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { recordToolMessage } from '../../../infrastructure/transcript/TranscriptWriter';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { type ToolBundleEvent, type ToolCallEvent, isBackendEvent } from '../../../types/backendEvents';

type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

function buildToolOutputMessage(result: ToolExecutionResult): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: result.formattedMessage,
    sender: 'assistant',
    type: 'tool-output',
    screenshotRef: result.screenshotRef || null,
    screenshotUrl: result.screenshotUrl || null,
    toolMetadata: result.result.data && typeof result.result.data === 'object'
      ? result.result.data.metadata || null
      : null,
    toolName: result.toolName,
    executionTime: result.executionTime,
    success: result.result.success,
    correlationId: result.correlationId,
  };
}

function buildBundleOutputMessage(result: BundleExecutionResult): ChatMessage {
  return {
    id: crypto.randomUUID(),
    text: result.formattedMessage,
    sender: 'assistant',
    type: 'tool-output',
    screenshotRef: result.screenshotRef || null,
    screenshotUrl: result.screenshotUrl || null,
    toolMetadata: {
      bundled: true,
      tool_count: result.results.length,
      tools: result.results.map(r => ({
        tool_name: r.tool_name,
        success: r.success,
        error: r.error
      }))
    },
    toolName: `bundled_tools (${result.results.length} tools)`,
    executionTime: result.totalTime,
    success: result.results.every(r => r.success),
    correlationId: result.correlationId,
  };
}

function buildTranscriptMetadata(
  toolName: string,
  correlationId: string,
  screenshotRef: string | null | undefined,
  modelContext: TranscriptModelContext,
) {
  return {
    messageType: 'tool-output' as const,
    toolName,
    correlationId,
    screenshotRef: screenshotRef || null,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  };
}

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
    const tools = (event.payload?.tools || [])
      .filter(tool => tool.name)
      .map(tool => ({
        toolName: tool.name as string,
        args: tool.args || {},
      }));

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

    const correlationId =
      event.payload.correlation_id ||
      event.payload.request_id ||
      event.id ||
      crypto.randomUUID();

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
