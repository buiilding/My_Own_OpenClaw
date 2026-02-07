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

/**
 * Custom hook for managing tool execution.
 * Connects UI to ToolExecutionService and handles tool-related events.
 */
export function useToolRunner(enabled = true) {
  const { addMessage } = useChatStore();
  const { config } = useAppConfigContext();
  const modelId = config?.selected_model_id || null;
  const modelProvider = config?.model_provider || null;

  const toolServiceRef = useRef<ToolExecutionService | null>(null);

  useEffect(() => {
    if (!enabled) {
      toolServiceRef.current = null;
      return undefined;
    }
    const toolService = new ToolExecutionService({
      onToolResult: (result: ToolExecutionResult) => {
        const toolOutputMessage: ChatMessage = {
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

        addMessage(toolOutputMessage);
        recordToolMessage(result.formattedMessage, {
          messageType: 'tool-output',
          toolName: result.toolName,
          correlationId: result.correlationId,
          screenshotRef: result.screenshotRef || null,
          modelId,
          modelProvider,
        });
      },
      onBundleResult: (result: BundleExecutionResult) => {
        const bundledMessage: ChatMessage = {
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

        addMessage(bundledMessage);
        recordToolMessage(result.formattedMessage, {
          messageType: 'tool-output',
          toolName: `bundled_tools`,
          correlationId: result.correlationId,
          screenshotRef: result.screenshotRef || null,
          modelId,
          modelProvider,
        });
      },
      sendToBackend: (payload: unknown) => {
        IpcBridge.send(SEND_CHANNELS.TO_BACKEND, payload);
      },
    });

    toolServiceRef.current = toolService;

    return () => {
      toolServiceRef.current = null;
    };
  }, [addMessage, enabled, modelId, modelProvider]);

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

    console.log('[useToolRunner] Received atomic bundle:', bundleId, tools.length, 'tools');

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
